import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { runDoctorCommand } from '../src/doctor.mjs';

test('reports a healthy installation as ok', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 0);
  const text = stdout.text();
  assert.match(text, /copilot: 1\.0\.105/);
  assert.match(text, /config: 1 providers/);
  assert.match(text, /providers: 0 keyed, 1 need no key/);
  assert.match(text, /native registry: .*not present/);
  assert.match(text, /No failures\./);
});

test('--json exposes the same checks', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--json', '--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.text());
  assert.equal(report.ok, true);
  assert.ok(Array.isArray(report.checks));
  assert.ok(report.checks.some((check) => check.name === 'node' && check.level === 'ok'));
});

test('a broken configuration fails the doctor', async () => {
  const { io } = await fixture();
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-doctor-'));
  const configPath = join(dir, 'broken.json');
  await writeFile(configPath, '{broken');

  const stdout = captureWritable();
  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 1);
  assert.match(stdout.text(), /FAIL config:/);
  assert.match(stdout.text(), /1 check\(s\) failed/);
});

test('the version probe runs without provider credentials', async () => {
  const { io, configPath } = await fixture([{
    id: 'keyed',
    name: 'Keyed',
    baseUrl: 'https://api.example.com/v1',
    apiKeyEnv: 'CUSTOM_PROVIDER_KEY',
    models: [{ model: 'm1' }],
  }]);
  let seenEnv;

  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout: captureWritable() },
    probeVersion: (bin, env) => {
      seenEnv = env;
      return '1.0.105';
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(Object.hasOwn(seenEnv, 'CUSTOM_PROVIDER_KEY'), false);
  assert.equal(Object.hasOwn(seenEnv, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(seenEnv, 'COPILOT_PROVIDER_BASE_URL'), false);
  assert.equal(seenEnv.COPILOT_BIN, 'copilot');
});

test('--online reports discovery failures instead of an empty success', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--online', '--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
    discover: async (providers, { onEvent }) => {
      onEvent({ type: 'error', provider: 'echo', message: '401 Unauthorized' });
      return providers.map((provider) => ({ ...provider, models: [] }));
    },
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.text(), /WARN discovery: no models from 1 configured provider\(s\); echo: 401 Unauthorized/);
});

test('a provider that only has a credential command is reported as legacy-only', async () => {
  const { io, configPath } = await fixture([{
    id: 'gateway',
    name: 'Gateway',
    baseUrl: 'https://gateway.example.com/v1',
    apiKeyCommand: 'vault read -field=key secret/llm',
  }]);
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.text(), /WARN apiKeyCommand: gateway work only with --legacy/);
});

test('a missing Copilot binary is a warning, not a failure', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => null,
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.text(), /WARN copilot:/);
});

async function fixture(providers = [{
  id: 'echo',
  name: 'Echo',
  baseUrl: 'http://127.0.0.1:1/v1',
  authRequired: false,
  models: [{ model: 'm1' }],
}]) {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-doctor-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({ providers }));

  const env = {
    COPILOT_BIN: 'copilot',
    COPILOT_HOME: join(dir, 'copilot-home'),
    COPILOT_BYOK_KEYSTORE: join(dir, 'keys.json'),
    COPILOT_BYOK_MODEL_CACHE: join(dir, 'models.json'),
    COPILOT_BYOK_LOG: join(dir, 'router.log'),
    COPILOT_BYOK_SHIM_DIR: join(dir, 'shim'),
    OPENAI_API_KEY: 'secret',
    COPILOT_PROVIDER_BASE_URL: 'https://stale.example.com/v1',
  };

  return {
    configPath,
    io: { stdout: captureWritable(), stderr: captureWritable(), env, stdin: { isTTY: false } },
  };
}

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
