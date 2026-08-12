import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { loadKeys, saveKey } from '../src/keystore.mjs';

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

async function scratchIo({ tty = false, env = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-keys-cmd-'));
  const stdout = captureWritable();
  const stderr = captureWritable();
  return {
    stdout,
    stderr,
    io: {
      stdin: { isTTY: tty },
      stdout,
      stderr,
      env: { COPILOT_BYOK_KEYSTORE: join(dir, 'keys.json'), ...env },
    },
  };
}

test('keys list reports the source of every provider credential', async () => {
  const { io, stdout } = await scratchIo({ env: { OPENAI_API_KEY: 'from-env' } });
  await saveKey('deepseek', 'from-store', io.env);

  const exitCode = await main(['keys', 'list'], io);

  assert.equal(exitCode, 0);
  const text = stdout.text();
  assert.match(text, /openai\s+environment \(OPENAI_API_KEY\)/);
  assert.match(text, /deepseek\s+key store/);
  assert.match(text, /anthropic\s+not set -> ANTHROPIC_API_KEY/);
  assert.doesNotMatch(text, /from-env|from-store/, 'values must never be printed');
});

test('keys list skips providers that need no credential', async () => {
  const { io, stdout } = await scratchIo();
  await main(['keys', 'list'], io);
  assert.doesNotMatch(stdout.text(), /^ollama/m);
});

test('keys path prints the store location', async () => {
  const { io, stdout } = await scratchIo();
  const exitCode = await main(['keys', 'path'], io);

  assert.equal(exitCode, 0);
  assert.equal(stdout.text().trim(), io.env.COPILOT_BYOK_KEYSTORE);
});

test('keys set refuses to read a key outside an interactive terminal', async () => {
  const { io, stderr } = await scratchIo({ tty: false });

  const exitCode = await main(['keys', 'set', 'openai'], io);

  assert.equal(exitCode, 1);
  assert.match(stderr.text(), /interactive terminal/);
  assert.deepEqual(await loadKeys(io.env), {}, 'nothing may be written');
});

test('keys set rejects an unknown provider before prompting', async () => {
  const { io, stderr } = await scratchIo({ tty: true });

  const exitCode = await main(['keys', 'set', 'not-a-provider'], io);

  assert.equal(exitCode, 1);
  assert.match(stderr.text(), /Unknown provider: not-a-provider/);
});

test('keys set requires a provider argument', async () => {
  const { io, stderr } = await scratchIo({ tty: true });

  const exitCode = await main(['keys', 'set'], io);

  assert.equal(exitCode, 1);
  assert.match(stderr.text(), /Specify a provider id/);
});

test('keys remove deletes a stored key and reports when there is none', async () => {
  const { io, stdout } = await scratchIo();
  await saveKey('deepseek', 'stored', io.env);

  assert.equal(await main(['keys', 'remove', 'deepseek'], io), 0);
  assert.match(stdout.text(), /Removed the stored key for DeepSeek/);
  assert.deepEqual(await loadKeys(io.env), {});

  assert.equal(await main(['keys', 'remove', 'deepseek'], io), 0);
  assert.match(stdout.text(), /No stored key for DeepSeek/);
});

test('an unknown keys action fails with guidance', async () => {
  const { io, stderr } = await scratchIo();

  const exitCode = await main(['keys', 'frobnicate'], io);

  assert.equal(exitCode, 1);
  assert.match(stderr.text(), /Unknown keys action: frobnicate/);
});

test('a stored key activates its provider in the router catalog', async () => {
  const { io, stdout } = await scratchIo();
  await saveKey('deepseek', 'stored-key', io.env);

  const exitCode = await main(['--dry-run'], io);

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.text());
  assert.ok(report.providers.includes('deepseek'));
  assert.ok(report.models.some((id) => id.startsWith('byok-deepseek-')));
});

test('keys honours --config so a custom provider can hold a key', async () => {
  const { io, stdout } = await scratchIo();
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-custom-'));
  const configPath = join(dir, 'providers.json');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'acme',
      name: 'Acme',
      baseUrl: 'https://api.acme.test/v1',
      apiKeyEnv: 'ACME_KEY',
      models: [{ model: 'm' }],
    }],
  }));

  const exitCode = await main(['keys', 'list', '--config', configPath], io);

  assert.equal(exitCode, 0);
  assert.match(stdout.text(), /acme\s+not set -> ACME_KEY/);
});
