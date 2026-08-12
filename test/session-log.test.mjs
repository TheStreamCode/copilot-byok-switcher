import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { createSessionLog, logPath } from '../src/session-log.mjs';

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

async function scratchIo(extraEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-log-'));
  const stderr = captureWritable();
  return {
    stderr,
    path: join(dir, 'router.log'),
    io: { stderr, env: { COPILOT_BYOK_LOG: join(dir, 'router.log'), ...extraEnv } },
  };
}

test('events go to the log file and never to the live screen', async () => {
  const { io, stderr, path } = await scratchIo();
  const log = createSessionLog(io);

  log.onEvent({ type: 'error', provider: 'acme', message: 'boom' });
  log.onEvent({ type: 'route', provider: 'acme', model: 'acme-large' });
  log.onEvent({ type: 'models', status: 200, injected: 7 });

  assert.equal(stderr.text(), '', 'the TUI must not be disturbed while it is drawing');

  const contents = await readFile(path, 'utf8');
  assert.match(contents, /error: acme: boom/);
  assert.match(contents, /route: acme -> acme-large/);
  assert.match(contents, /models: upstream 200, 7 BYOK entries added/);
});

test('the summary is printed only when something went wrong', async () => {
  const quiet = await scratchIo();
  const quietLog = createSessionLog(quiet.io);
  quietLog.onEvent({ type: 'route', provider: 'acme', model: 'm' });
  quietLog.summarize();
  assert.equal(quiet.stderr.text(), '', 'a clean session says nothing');

  const noisy = await scratchIo();
  const noisyLog = createSessionLog(noisy.io);
  noisyLog.onEvent({ type: 'error', message: 'first' });
  noisyLog.onEvent({ type: 'error', message: 'second' });
  noisyLog.summarize();

  assert.match(noisy.stderr.text(), /2 router errors/);
  assert.match(noisy.stderr.text(), /router\.log/, 'the reader needs the path');
});

test('debug mode still streams events live, screen damage accepted', async () => {
  const { io, stderr } = await scratchIo({ COPILOT_BYOK_DEBUG: '1' });
  const log = createSessionLog(io);

  log.onEvent({ type: 'error', message: 'visible now' });

  assert.match(stderr.text(), /visible now/);
});

test('an oversized log is truncated instead of growing without bound', async () => {
  const { io, path } = await scratchIo();
  const { mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'x'.repeat(3 * 1024 * 1024), 'utf8');

  createSessionLog(io);

  assert.ok((await stat(path)).size < 1024, 'the previous content is dropped at startup');
});

test('a log that cannot be written never breaks the session', async () => {
  const io = { stderr: captureWritable(), env: { COPILOT_BYOK_LOG: join('\0invalid', 'router.log') } };

  const log = createSessionLog(io);
  assert.doesNotThrow(() => log.onEvent({ type: 'error', message: 'boom' }));
  assert.doesNotThrow(() => log.summarize());
});

test('the default location follows the platform convention', () => {
  const windows = logPath({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' });
  const posix = logPath({ XDG_STATE_HOME: '/home/x/.local/state' });

  assert.match(process.platform === 'win32' ? windows : posix, /copilot-byok.router\.log$/);
});
