import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { runModelsCommand } from '../src/models-command.mjs';

test('lists live discovery results when --offline is not set', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      data: [{ id: 'live-model', context_length: 64000, supported_features: ['tools'], created: 1 }],
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-models-live-'));
    const configPath = join(dir, 'providers.json');
    await writeFile(configPath, JSON.stringify({
      providers: [{
        id: 'live',
        name: 'Live',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        modelsUrl: `http://127.0.0.1:${server.address().port}/v1/models`,
        authRequired: false,
      }],
    }));

    const stdout = captureWritable();
    const exitCode = await runModelsCommand({
      argv: ['--json', '--config', configPath],
      io: {
        stdout,
        stderr: captureWritable(),
        env: {
          COPILOT_BYOK_KEYSTORE: join(dir, 'keys.json'),
          COPILOT_BYOK_MODEL_CACHE: join(dir, 'models.json'),
        },
      },
    });

    assert.equal(exitCode, 0);
    const rows = JSON.parse(stdout.text());
    assert.equal(rows[0].models[0].id, 'live-model');
    assert.equal(rows[0].models[0].contextWindow, 64000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('lists pinned models without touching the network in offline mode', async () => {
  const { configPath, env } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runModelsCommand({
    argv: ['--offline', '--config', configPath],
    io: { stdout, stderr: captureWritable(), env },
  });

  assert.equal(exitCode, 0);
  const text = stdout.text();
  assert.match(text, /echo {2}\(1 models, offline lists\)/);
  assert.match(text, /m1 {2}\(128k context, reasoning\)/);
  assert.match(text, /keyed {2}\(1 models, offline lists\)/);
});

test('--json is machine-readable and can be filtered by provider', async () => {
  const { configPath, env } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runModelsCommand({
    argv: ['--offline', '--json', 'echo', '--config', configPath],
    io: { stdout, stderr: captureWritable(), env },
  });

  assert.equal(exitCode, 0);
  const rows = JSON.parse(stdout.text());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'echo');
  assert.deepEqual(rows[0].models, [{
    id: 'm1',
    label: null,
    contextWindow: 128000,
    vision: false,
    reasoning: true,
  }]);
});

test('an unknown provider is rejected', async () => {
  const { configPath, env } = await fixture();

  await assert.rejects(
    () => runModelsCommand({
      argv: ['--offline', 'missing', '--config', configPath],
      io: { stdout: captureWritable(), stderr: captureWritable(), env },
    }),
    /Unknown provider: missing/,
  );
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-models-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      {
        id: 'echo',
        name: 'Echo',
        baseUrl: 'http://127.0.0.1:1/v1',
        authRequired: false,
        models: [{ model: 'm1', contextWindow: 128000, reasoning: true }],
      },
      {
        id: 'keyed',
        name: 'Keyed',
        baseUrl: 'https://api.example.com/v1',
        apiKeyEnv: 'TEST_PROVIDER_KEY',
        models: [{ model: 'm2' }],
      },
    ],
  }));

  return {
    configPath,
    env: {
      TEST_PROVIDER_KEY: 'secret',
      COPILOT_BYOK_KEYSTORE: join(dir, 'keys.json'),
      COPILOT_BYOK_MODEL_CACHE: join(dir, 'models.json'),
    },
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
