import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { shimDir } from '../src/shim-install.mjs';

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
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-shim-'));
  const stdout = captureWritable();
  const stderr = captureWritable();
  return {
    dir,
    stdout,
    stderr,
    io: {
      stdin: { isTTY: false },
      stdout,
      stderr,
      env: { COPILOT_BYOK_SHIM_DIR: dir, COPILOT_BIN: '/usr/local/bin/copilot', PATH: '' },
    },
  };
}

test('the POSIX shim points the launcher at the real CLI', async () => {
  const { io, dir } = await scratchIo();

  assert.equal(await main(['shim', 'install'], io), 0);

  const script = await readFile(join(dir, 'copilot'), 'utf8');
  assert.match(script, /^#!\/bin\/sh/);
  assert.match(script, /COPILOT_BIN='\/usr\/local\/bin\/copilot'/, 'without this the shim would call itself');
  assert.match(script, /exec copilot-byok "\$@"/);
});

test('the shim is executable on POSIX', { skip: platform() === 'win32' }, async () => {
  const { io, dir } = await scratchIo();
  await main(['shim', 'install'], io);

  const info = await stat(join(dir, 'copilot'));
  assert.ok(info.mode & 0o111, 'a shim nobody can execute is useless');
});

test('Windows also gets a .cmd, other systems do not need one', async () => {
  const { io, dir } = await scratchIo();
  await main(['shim', 'install'], io);

  const entries = await readdir(dir);
  assert.ok(entries.includes('copilot'));
  assert.equal(entries.includes('copilot.cmd'), platform() === 'win32');
});

test('install explains how to put the directory on PATH for this platform', async () => {
  const { io, stdout } = await scratchIo();
  await main(['shim', 'install'], io);

  const text = stdout.text();
  assert.match(text, platform() === 'win32' ? /SetEnvironmentVariable/ : /bashrc|zshrc|fish_add_path/);
});

test('status reports whether the directory is actually on PATH', async () => {
  const { io, dir, stdout } = await scratchIo();

  await main(['shim', 'status'], io);
  assert.match(stdout.text(), /not installed/);

  await main(['shim', 'install'], io);
  await main(['shim', 'status'], io);
  assert.match(stdout.text(), /NOT on PATH/, 'the empty PATH in this test must be reported');

  io.env.PATH = dir;
  await main(['shim', 'status'], io);
  assert.match(stdout.text(), /is on PATH/);
});

test('uninstall removes the shim and is safe to repeat', async () => {
  const { io, dir } = await scratchIo();
  await main(['shim', 'install'], io);

  assert.equal(await main(['shim', 'uninstall'], io), 0);
  assert.equal(await main(['shim', 'uninstall'], io), 0);
  assert.deepEqual(await readdir(dir).catch(() => []), []);
});

test('an unknown shim action fails with guidance', async () => {
  const { io, stderr } = await scratchIo();

  assert.equal(await main(['shim', 'frobnicate'], io), 1);
  assert.match(stderr.text(), /Unknown shim action/);
});

test('the default location follows each platform convention', () => {
  const windows = shimDir({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' });
  const posix = shimDir({ XDG_DATA_HOME: '/home/x/.local/share' });

  assert.match(platform() === 'win32' ? windows : posix, /copilot-byok.bin$/);
});
