import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProviderEnvironment } from '../src/provider-env.mjs';

test('separates Copilot catalog model from provider wire model', () => {
  const env = buildProviderEnvironment({
    provider: {
      type: 'openai',
      baseUrl: 'https://llm.chutes.ai/v1',
      apiKey: 'secret',
      catalogModelId: 'gpt-4.1',
    },
    wireModel: 'moonshotai/Kimi-K2.6-TEE',
  });

  assert.equal(env.COPILOT_PROVIDER_TYPE, 'openai');
  assert.equal(env.COPILOT_PROVIDER_BASE_URL, 'https://llm.chutes.ai/v1');
  assert.equal(env.COPILOT_PROVIDER_API_KEY, 'secret');
  assert.equal(env.COPILOT_MODEL, 'gpt-4.1');
  assert.equal(env.COPILOT_PROVIDER_WIRE_MODEL, 'moonshotai/Kimi-K2.6-TEE');
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_MODEL_ID'), false);
});

test('passes explicit token limits when configured', () => {
  const env = buildProviderEnvironment({
    provider: {
      type: 'anthropic',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
      catalogModelId: 'claude-sonnet-4.6',
      maxPromptTokens: 200000,
      maxOutputTokens: 64000,
    },
    wireModel: 'custom-model',
  });

  assert.equal(env.COPILOT_PROVIDER_MAX_PROMPT_TOKENS, '200000');
  assert.equal(env.COPILOT_PROVIDER_MAX_OUTPUT_TOKENS, '64000');
});

test('enables Copilot offline mode and the configured wire API', () => {
  const env = buildProviderEnvironment({
    provider: {
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      wireApi: 'responses',
    },
    wireModel: 'custom-model',
    offline: true,
  });

  assert.equal(env.COPILOT_PROVIDER_WIRE_API, 'responses');
  assert.equal(env.COPILOT_OFFLINE, 'true');
});

test('prefers bearer authentication and passes transport-specific settings', () => {
  const env = buildProviderEnvironment({
    provider: {
      type: 'azure',
      baseUrl: 'https://example.openai.azure.com',
      apiKey: 'api-secret',
      bearerToken: 'bearer-secret',
      transport: 'websockets',
      azureApiVersion: '2025-04-01-preview',
    },
    wireModel: 'deployment-name',
  });

  assert.equal(env.COPILOT_PROVIDER_BEARER_TOKEN, 'bearer-secret');
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_API_KEY'), false);
  assert.equal(env.COPILOT_PROVIDER_TRANSPORT, 'websockets');
  assert.equal(env.COPILOT_PROVIDER_AZURE_API_VERSION, '2025-04-01-preview');
});
