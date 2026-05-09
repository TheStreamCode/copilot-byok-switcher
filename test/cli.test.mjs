import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { buildCopilotSpawnOptions } from '../src/cli.mjs';
import { sanitizeCopilotEnvironment } from '../src/process-env.mjs';

test('native mode does not require provider config to parse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'broken.json');
  await writeFile(configPath, '{not json');

  const output = captureWritable();
  const exitCode = await main(['--native', '--dry-run'], {
    stdin: { isTTY: false },
    stdout: output,
    stderr: captureWritable(),
    env: { COPILOT_BYOK_CONFIG: configPath },
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).native, true);
});

test('sanitizes stale Copilot BYOK env before launching child process', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/bin',
    COPILOT_PROVIDER_BASE_URL: 'https://old.example.com',
    COPILOT_PROVIDER_API_KEY: 'old-secret',
    COPILOT_PROVIDER_BEARER_TOKEN: 'old-bearer',
    COPILOT_PROVIDER_WIRE_API: 'responses',
    COPILOT_PROVIDER_MAX_PROMPT_TOKENS: '1',
  }, {
    COPILOT_PROVIDER_BASE_URL: 'https://new.example.com',
  });

  assert.equal(env.PATH, '/bin');
  assert.equal(env.COPILOT_PROVIDER_BASE_URL, 'https://new.example.com');
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_BEARER_TOKEN'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_WIRE_API'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_MAX_PROMPT_TOKENS'), false);
});

test('sanitizes provider source key environment variables', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/bin',
    CHUTES_API_KEY: 'secret',
    OPENCODE_GO_API_KEY: 'secret',
    FIREWORKS_API_KEY: 'secret',
  }, {});

  assert.equal(env.PATH, '/bin');
  assert.equal(Object.hasOwn(env, 'CHUTES_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'OPENCODE_GO_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'FIREWORKS_API_KEY'), false);
});

test('uses Windows shell for command shims', () => {
  const options = buildCopilotSpawnOptions({
    env: {},
    platform: 'win32',
  });

  assert.equal(options.shell, true);
});

test('uses direct spawn without shell on Unix-like platforms', () => {
  const options = buildCopilotSpawnOptions({
    env: {},
    platform: 'linux',
  });

  assert.equal(options.shell, false);
});

test('list-models fails when provider catalog request fails', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  });

  try {
    await assert.rejects(
      () => main(['--provider', 'chutes', '--list-models'], {
        stdin: { isTTY: false },
        stdout: captureWritable(),
        stderr: captureWritable(),
        env: {},
      }),
      /401 Unauthorized/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function captureWritable() {
  let buffer = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });
  stream.text = () => buffer;
  return stream;
}
