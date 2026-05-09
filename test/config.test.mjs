import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { findProvider, loadConfig, loadConfigFromPath } from '../src/config.mjs';

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

test('loads DeepSeek, Z.ai, and MiniMax as built-in providers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-empty-config-'));
  const config = await loadConfig({ env: { XDG_CONFIG_HOME: dir } });

  const deepseek = findProvider(config, 'deepseek');
  assert.equal(deepseek.name, 'DeepSeek AI');
  assert.equal(deepseek.type, 'openai');
  assert.equal(deepseek.baseUrl, 'https://api.deepseek.com');
  assert.equal(deepseek.modelsUrl, 'https://api.deepseek.com/models');
  assert.equal(deepseek.defaultModel, 'deepseek-v4-pro');
  assert.deepEqual(deepseek.apiKeyEnv, ['DEEPSEEK_API_KEY', 'COPILOT_DEEPSEEK_API_KEY']);
  assert.equal(deepseek.apiKey, null);

  const zai = findProvider(config, 'glm');
  assert.equal(zai.id, 'zai');
  assert.equal(zai.name, 'Z.ai');
  assert.equal(zai.type, 'openai');
  assert.equal(zai.baseUrl, 'https://api.z.ai/api/coding/paas/v4');
  assert.equal(zai.modelsUrl, 'https://api.z.ai/api/coding/paas/v4/models');
  assert.equal(zai.defaultModel, 'glm-4.7');
  assert.deepEqual(zai.apiKeyEnv, ['ZAI_API_KEY', 'Z_AI_API_KEY', 'GLM_API_KEY', 'COPILOT_ZAI_API_KEY']);
  assert.equal(zai.apiKey, null);

  const minimax = findProvider(config, 'minimax-ai');
  assert.equal(minimax.id, 'minimax');
  assert.equal(minimax.name, 'MiniMax');
  assert.equal(minimax.type, 'openai');
  assert.equal(minimax.baseUrl, 'https://api.minimax.io/v1');
  assert.equal(minimax.modelsUrl, 'https://api.minimax.io/v1/models');
  assert.equal(minimax.defaultModel, 'MiniMax-M2.7');
  assert.deepEqual(minimax.apiKeyEnv, ['MINIMAX_API_KEY', 'COPILOT_MINIMAX_API_KEY']);
  assert.equal(minimax.apiKey, null);
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
