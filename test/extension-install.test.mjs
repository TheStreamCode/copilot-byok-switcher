import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { extensionDir } from '../src/extension-install.mjs';

function captureWritable() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  stream.text = () => chunks.join('');
  return stream;
}

async function scratchIo() {
  const home = await mkdtemp(join(tmpdir(), 'copilot-byok-ext-'));
  const stdout = captureWritable();
  const stderr = captureWritable();
  return {
    stdout,
    stderr,
    io: { stdin: { isTTY: false }, stdout, stderr, env: { COPILOT_HOME: home } },
  };
}

test('the extension lands in COPILOT_HOME with the package root resolved', async () => {
  const { io, stdout } = await scratchIo();

  assert.equal(await main(['extension', 'install'], io), 0);

  const target = join(extensionDir(io.env), 'extension.mjs');
  const contents = await readFile(target, 'utf8');

  assert.doesNotMatch(contents, /__PACKAGE_ROOT__/, 'the placeholder must be replaced');
  assert.match(contents, /const PACKAGE_ROOT = "file:\/\//, 'imports need a file URL, not a bare path');
  assert.match(contents, /name: 'byok'/);
  assert.match(stdout.text(), /--experimental/, 'the flag requirement must be stated');
});

test('status reflects whether the extension is installed', async () => {
  const { io, stdout } = await scratchIo();

  assert.equal(await main(['extension', 'status'], io), 0);
  assert.match(stdout.text(), /not installed/);

  await main(['extension', 'install'], io);
  assert.equal(await main(['extension', 'status'], io), 0);
  assert.match(stdout.text(), /is installed at/);
});

test('uninstall removes the directory and is safe to repeat', async () => {
  const { io, stdout } = await scratchIo();
  await main(['extension', 'install'], io);

  assert.equal(await main(['extension', 'uninstall'], io), 0);
  assert.equal(await main(['extension', 'uninstall'], io), 0, 'removing twice must not fail');

  await main(['extension', 'status'], io);
  assert.match(stdout.text(), /not installed/);
});

test('installing twice overwrites instead of failing', async () => {
  const { io } = await scratchIo();

  assert.equal(await main(['extension', 'install'], io), 0);
  assert.equal(await main(['extension', 'install'], io), 0);
});

test('an unknown extension action fails with guidance', async () => {
  const { io, stderr } = await scratchIo();

  assert.equal(await main(['extension', 'sideload'], io), 1);
  assert.match(stderr.text(), /Unknown extension action: sideload/);
});

test('the installed extension is syntactically valid', async () => {
  const { io } = await scratchIo();
  await main(['extension', 'install'], io);

  // The SDK only exists inside a Copilot session, so the module cannot be imported
  // here; parsing it catches syntax damage from the package-root rewrite.
  const { spawnSync } = await import('node:child_process');
  const target = join(extensionDir(io.env), 'extension.mjs');
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
});
