import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfigFromPath } from '../src/config.mjs';

test('loads providers from JSON config and resolves apiKeyEnv', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      {
        name: 'Chutes',
        id: 'chutes',
        type: 'openai',
        baseUrl: 'https://llm.chutes.ai/v1',
        apiKeyEnv: 'TEST_CHUTES_KEY',
        catalogModelId: 'gpt-4.1',
      },
    ],
  }));

  const config = await loadConfigFromPath(configPath, { TEST_CHUTES_KEY: 'secret' });

  assert.equal(config.providers[0].id, 'chutes');
  assert.equal(config.providers[0].apiKey, 'secret');
  assert.equal(config.providers[0].catalogModelId, 'gpt-4.1');
});

test('rejects inline API keys in provider config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      {
        name: 'Unsafe',
        type: 'openai',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'secret-on-disk',
      },
    ],
  }));

  await assert.rejects(
    () => loadConfigFromPath(configPath, {}),
    /Inline apiKey is not allowed/
  );
});

test('rejects secret model headers in provider config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      {
        name: 'Unsafe Headers',
        type: 'openai',
        baseUrl: 'https://api.example.com/v1',
        modelsHeaders: {
          Authorization: 'Bearer secret-on-disk',
        },
      },
    ],
  }));

  await assert.rejects(
    () => loadConfigFromPath(configPath, {}),
    /Secret model headers are not allowed/
  );
});
