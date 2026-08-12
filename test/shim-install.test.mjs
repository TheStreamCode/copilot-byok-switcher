import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { findShadowingEntries, shimDir } from '../src/shim-install.mjs';

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
  const profileDir = await mkdtemp(join(tmpdir(), 'copilot-byok-profile-'));
  const stdout = captureWritable();
  const stderr = captureWritable();
  return {
    dir,
    profileDir,
    stdout,
    stderr,
    io: {
      stdin: { isTTY: false },
      stdout,
      stderr,
      env: {
        COPILOT_BYOK_SHIM_DIR: dir,
        COPILOT_BYOK_PROFILE_DIR: profileDir,
        COPILOT_BIN: '/usr/local/bin/copilot',
        PATH: '',
      },
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

test('a copilot earlier on PATH is detected: the shim alone cannot win there', async () => {
  const earlier = await mkdtemp(join(tmpdir(), 'copilot-byok-earlier-'));
  const ours = await mkdtemp(join(tmpdir(), 'copilot-byok-ours-'));
  const env = { PATH: [earlier, ours].join(delimiter) };
  const exists = (path) => path.startsWith(earlier);

  assert.deepEqual(findShadowingEntries(ours, env, exists), [earlier]);
  assert.deepEqual(findShadowingEntries(ours, { PATH: ours }, () => false), []);
});

test('install says plainly when only the shell function can work', async () => {
  const { io, dir, stdout } = await scratchIo();
  const earlier = await mkdtemp(join(tmpdir(), 'copilot-byok-earlier-'));
  await writeFile(join(earlier, platform() === 'win32' ? 'copilot.cmd' : 'copilot'), '');
  io.env.PATH = [earlier, dir].join(delimiter);

  await main(['shim', 'install'], io);

  assert.match(stdout.text(), /comes earlier on PATH/);
  assert.match(stdout.text(), /shell function/, 'the user must be told what actually fixes it');
});

test('the shell function is written between markers and removed cleanly', async () => {
  const { io, profileDir } = await scratchIo();
  const bashrc = join(profileDir, '.bashrc');
  await writeFile(bashrc, 'export EXISTING=1\n');

  await main(['shim', 'install'], io);
  let contents = await readFile(bashrc, 'utf8');
  assert.match(contents, /export EXISTING=1/, 'existing content survives');
  assert.match(contents, /command copilot-byok/);

  // Installing twice must not duplicate the block.
  await main(['shim', 'install'], io);
  contents = await readFile(bashrc, 'utf8');
  assert.equal(contents.match(/# >>> copilot-byok >>>/g).length, 1);

  await main(['shim', 'uninstall'], io);
  contents = await readFile(bashrc, 'utf8');
  assert.match(contents, /export EXISTING=1/, 'only our block is removed');
  assert.doesNotMatch(contents, /copilot-byok/);
});

test('a shell profile that does not exist is left alone', async () => {
  const { io, profileDir } = await scratchIo();

  await main(['shim', 'install'], io);

  const entries = await readdir(profileDir);
  assert.ok(!entries.includes('.bashrc'), 'no shell profile is conjured out of nothing');
});

test('status reports whether the shim can actually take precedence', async () => {
  const { io, dir, stdout } = await scratchIo();

  await main(['shim', 'status'], io);
  assert.match(stdout.text(), /Not installed/);

  await main(['shim', 'install'], io);
  await main(['shim', 'status'], io);
  assert.match(stdout.text(), /not on PATH/, 'the empty PATH in this test must be reported');

  io.env.PATH = dir;
  await main(['shim', 'status'], io);
  assert.match(stdout.text(), /on PATH and nothing precedes it/);
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
