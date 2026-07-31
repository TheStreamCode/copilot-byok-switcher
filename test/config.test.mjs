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

test('loads documented API and token-plan providers as built-ins', async () => {
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
  assert.equal(zai.defaultModel, 'glm-5.1');
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

  const openrouter = findProvider(config, 'or');
  assert.equal(openrouter.id, 'openrouter');
  assert.equal(openrouter.baseUrl, 'https://openrouter.ai/api/v1');
  assert.match(openrouter.modelsUrl, /supported_parameters=tools/);
  assert.equal(openrouter.defaultModel, 'openrouter/auto');

  const moonshot = findProvider(config, 'kimi');
  assert.equal(moonshot.id, 'moonshot');
  assert.equal(moonshot.baseUrl, 'https://api.moonshot.ai/v1');
  assert.equal(moonshot.modelsUrl, 'https://api.moonshot.ai/v1/models');
  assert.equal(moonshot.defaultModel, 'kimi-k3');

  const alibaba = findProvider(config, 'qwen');
  assert.equal(alibaba.id, 'alibaba-token-plan');
  assert.equal(alibaba.baseUrl, 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  assert.equal(alibaba.modelsUrl, undefined);
  assert.equal(alibaba.defaultModel, 'qwen3.7-plus');

  const tencent = findProvider(config, 'tokenhub');
  assert.equal(tencent.id, 'tencent-token-plan');
  assert.equal(tencent.baseUrl, 'https://api.lkeap.cloud.tencent.com/plan/v3');
  assert.equal(tencent.modelsUrl, undefined);
  assert.equal(tencent.defaultModel, 'tc-code-latest');
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

test('validates provider URLs, types, environment names, and identifiers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'invalid provider',
      name: 'Invalid',
      type: 'unknown',
      baseUrl: 'not-a-url',
      apiKeyEnv: 'NOT VALID',
    }],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /Provider id/);
});

test('does not expose invalid credential environment names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'private-provider',
      name: 'Private Provider',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEnv: 'SENSITIVE CREDENTIAL SOURCE',
    }],
  }));

  await assert.rejects(
    () => loadConfigFromPath(configPath, {}),
    (error) => {
      assert.match(error.message, /invalid environment variable name/);
      assert.doesNotMatch(error.message, /SENSITIVE CREDENTIAL SOURCE/);
      return true;
    }
  );
});

test('rejects ambiguous provider identifiers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      { id: 'one', aliases: ['shared'], name: 'One', type: 'openai', baseUrl: 'https://one.example.com' },
      { id: 'two', aliases: ['shared'], name: 'Two', type: 'openai', baseUrl: 'https://two.example.com' },
    ],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /used by both One and Two/);
});

test('rejects duplicate ids even when providers have the same display name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      { id: 'duplicate', name: 'Same', type: 'openai', baseUrl: 'https://one.example.com' },
      { id: 'duplicate', name: 'Same', type: 'openai', baseUrl: 'https://two.example.com' },
    ],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /used by both Same and Same/);
});

test('validates wire API values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'invalid-wire-api',
      name: 'Invalid Wire API',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      wireApi: 'legacy',
    }],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /completions.*responses/);
});

test('rejects an OpenAI wire API override on Anthropic providers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'anthropic-wire-api',
      name: 'Anthropic Wire API',
      type: 'anthropic',
      baseUrl: 'https://api.example.com',
      wireApi: 'responses',
    }],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /Anthropic protocol/);
});

test('adds the config path to malformed JSON errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, '{broken');

  await assert.rejects(() => loadConfigFromPath(configPath, {}), new RegExp(configPath.replaceAll('\\', '\\\\')));
});
