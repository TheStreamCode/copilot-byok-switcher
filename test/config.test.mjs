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

test('loads documented built-in providers and aliases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-empty-config-'));
  const config = await loadConfig({ env: { XDG_CONFIG_HOME: dir } });
  assert.equal(config.providers[0].id, 'chutes');

  const openai = findProvider(config, 'openai');
  assert.equal(openai.baseUrl, 'https://api.openai.com/v1');
  assert.equal(openai.modelsUrl, 'https://api.openai.com/v1/models');
  assert.equal(openai.defaultModel, 'gpt-5.6-sol');
  assert.equal(openai.wireApi, 'responses');
  assert.deepEqual(openai.apiKeyEnv, ['OPENAI_API_KEY', 'COPILOT_OPENAI_API_KEY']);

  const anthropic = findProvider(config, 'claude');
  assert.equal(anthropic.id, 'anthropic');
  assert.equal(anthropic.baseUrl, 'https://api.anthropic.com');
  assert.equal(anthropic.modelsAuth, 'x-api-key');
  assert.equal(anthropic.modelsHeaders['anthropic-version'], '2023-06-01');
  assert.deepEqual(anthropic.apiKeyEnv, ['ANTHROPIC_API_KEY', 'COPILOT_ANTHROPIC_API_KEY']);

  const ollama = findProvider(config, 'ollama');
  assert.equal(ollama.baseUrl, 'http://localhost:11434/v1');
  assert.equal(ollama.authRequired, false);
  assert.equal(ollama.apiKey, null);

  const opencodeAnthropic = findProvider(config, 'opencode');
  assert.equal(opencodeAnthropic.id, 'opencode-go');
  assert.equal(opencodeAnthropic.defaultModel, 'minimax-m3');
  assert.deepEqual(opencodeAnthropic.modelIncludePrefixes, ['minimax-', 'qwen']);

  const opencodeOpenAi = findProvider(config, 'go-openai');
  assert.equal(opencodeOpenAi.id, 'opencode-go-openai');
  assert.equal(opencodeOpenAi.type, 'openai');
  assert.equal(opencodeOpenAi.baseUrl, 'https://opencode.ai/zen/go/v1');
  assert.equal(opencodeOpenAi.defaultModel, 'deepseek-v4-pro');

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
  assert.equal(zai.name, 'Z.ai Coding Plan');
  assert.equal(zai.type, 'openai');
  assert.equal(zai.baseUrl, 'https://api.z.ai/api/coding/paas/v4');
  assert.equal(zai.modelsUrl, 'https://api.z.ai/api/coding/paas/v4/models');
  assert.equal(zai.defaultModel, 'glm-5.2');
  assert.deepEqual(zai.apiKeyEnv, ['ZAI_API_KEY', 'Z_AI_API_KEY', 'GLM_API_KEY', 'COPILOT_ZAI_API_KEY']);
  assert.equal(zai.apiKey, null);

  const zaiApi = findProvider(config, 'glm-api');
  assert.equal(zaiApi.id, 'zai-api');
  assert.equal(zaiApi.baseUrl, 'https://api.z.ai/api/paas/v4');
  assert.equal(zaiApi.modelsUrl, 'https://api.z.ai/api/paas/v4/models');
  assert.equal(zaiApi.defaultModel, 'glm-5.2');

  const minimax = findProvider(config, 'minimax-ai');
  assert.equal(minimax.id, 'minimax');
  assert.equal(minimax.name, 'MiniMax');
  assert.equal(minimax.type, 'openai');
  assert.equal(minimax.baseUrl, 'https://api.minimax.io/v1');
  assert.equal(minimax.modelsUrl, 'https://api.minimax.io/v1/models');
  assert.equal(minimax.defaultModel, 'MiniMax-M3');
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

  const groq = findProvider(config, 'groq');
  assert.equal(groq.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(groq.defaultModel, 'openai/gpt-oss-120b');
  assert.deepEqual(groq.apiKeyEnv, ['GROQ_API_KEY', 'COPILOT_GROQ_API_KEY']);

  const xai = findProvider(config, 'grok');
  assert.equal(xai.id, 'xai');
  assert.equal(xai.baseUrl, 'https://api.x.ai/v1');
  assert.equal(xai.defaultModel, 'grok-4.5');
  assert.deepEqual(xai.apiKeyEnv, ['XAI_API_KEY', 'COPILOT_XAI_API_KEY']);

  const mistral = findProvider(config, 'mistral-ai');
  assert.equal(mistral.id, 'mistral');
  assert.equal(mistral.baseUrl, 'https://api.mistral.ai/v1');
  assert.equal(mistral.defaultModel, 'devstral-latest');
  assert.deepEqual(mistral.apiKeyEnv, ['MISTRAL_API_KEY', 'COPILOT_MISTRAL_API_KEY']);

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

test('keeps the published provider example synchronized with built-ins', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-empty-config-'));
  const builtIns = await loadConfig({ env: { XDG_CONFIG_HOME: dir } });
  const example = await loadConfigFromPath(
    new URL('../examples/providers.example.json', import.meta.url),
    {}
  );

  assert.deepEqual(
    example.providers.map((provider) => provider.id).sort(),
    builtIns.providers.map((provider) => provider.id).sort()
  );
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

test('rejects inline credential fields even when their values are empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      name: 'Unsafe Empty Secret',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      bearerToken: '',
    }],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /Inline bearerToken is not allowed/);
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

test('rejects broader secret headers and credential-like URL query parameters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const headersPath = join(dir, 'headers.json');
  await writeFile(headersPath, JSON.stringify({
    providers: [{
      name: 'Unsafe Cookie',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelsHeaders: { Cookie: 'session=value' },
    }],
  }));
  await assert.rejects(() => loadConfigFromPath(headersPath, {}), /Secret model headers are not allowed/);

  const urlPath = join(dir, 'url.json');
  await writeFile(urlPath, JSON.stringify({
    providers: [{
      name: 'Unsafe URL',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1?api_key=secret',
    }],
  }));
  await assert.rejects(() => loadConfigFromPath(urlPath, {}), /credential-like query parameters/);
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

test('normalizes additive transport, Azure, auth, and model filter options', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'extended',
      name: 'Extended',
      type: 'azure',
      baseUrl: 'https://example.openai.azure.com',
      authRequired: false,
      modelsAuth: 'api-key',
      transport: 'websockets',
      azureApiVersion: '2025-04-01-preview',
      modelIncludePrefixes: [' chat- '],
      modelExcludePrefixes: ['chat-legacy'],
    }],
  }));

  const provider = (await loadConfigFromPath(configPath, {})).providers[0];
  assert.equal(provider.authRequired, false);
  assert.equal(provider.modelsAuth, 'api-key');
  assert.equal(provider.transport, 'websockets');
  assert.equal(provider.azureApiVersion, '2025-04-01-preview');
  assert.deepEqual(provider.modelIncludePrefixes, ['chat-']);
  assert.deepEqual(provider.modelExcludePrefixes, ['chat-legacy']);
});

test('rejects invalid additive provider option values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'invalid-options',
      name: 'Invalid Options',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      authRequired: 'sometimes',
      modelsAuth: 'cookie',
      transport: 'stdio',
      modelIncludePrefixes: [],
    }],
  }));

  await assert.rejects(() => loadConfigFromPath(configPath, {}), /modelIncludePrefixes|transport|authRequired|modelsAuth/);
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
