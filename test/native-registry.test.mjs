import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNativeRegistry, nativeSelectionId, nativeSelectionMap } from '../src/native-registry.mjs';

const providers = [{
  id: 'acme',
  name: 'Acme',
  type: 'openai',
  baseUrl: 'https://api.acme.test/v1',
  apiKey: 'secret',
  wireApi: 'responses',
  headers: { 'X-Tenant': 'team-a' },
  models: [{
    model: 'reasoner',
    label: 'Acme Reasoner',
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    reasoning: true,
    vision: true,
  }],
}];

test('builds a providers.json registry from resolved providers', () => {
  const registry = buildNativeRegistry(providers);

  assert.deepEqual(registry.providers, [{
    name: 'acme',
    type: 'openai',
    baseUrl: 'https://api.acme.test/v1',
    apiKey: 'secret',
    wireApi: 'responses',
    headers: { 'X-Tenant': 'team-a' },
  }]);

  const [model] = registry.models;
  assert.equal(model.id, 'reasoner');
  assert.equal(model.provider, 'acme');
  assert.equal(model.name, 'Acme Reasoner');
  assert.equal(model.maxContextWindowTokens, 200_000);
  assert.equal(model.maxOutputTokens, 50_000);
  assert.equal(model.maxPromptTokens, 150_000);
  assert.equal(model.capabilities.supports.toolCalls, true);
  assert.equal(model.capabilities.supports.streaming, true);
  assert.equal(model.capabilities.supports.vision, true);
  assert.deepEqual(model.capabilities.supports.reasoning_effort, ['low', 'medium', 'high']);
});

test('the model id can be disabled explicitly and bearer tokens win', () => {
  const registry = buildNativeRegistry([{
    id: 'gateway',
    name: 'Gateway',
    baseUrl: 'https://gateway.test/v1',
    bearerToken: 'bearer',
    apiKey: 'ignored',
    azureApiVersion: '2024-10-21',
    models: [{
      model: 'plain',
      reasoning: true,
      reasoningEffortPicker: false,
      reasoningEffortLevels: ['low', 'high'],
    }],
  }]);

  assert.equal(registry.providers[0].bearerToken, 'bearer');
  assert.equal(Object.hasOwn(registry.providers[0], 'apiKey'), false);
  assert.deepEqual(registry.providers[0].azure, { apiVersion: '2024-10-21' });
  assert.equal(registry.models[0].capabilities.supports.reasoning_effort, undefined);
});

test('authless providers carry no credential field', () => {
  const registry = buildNativeRegistry([{
    id: 'local',
    name: 'Local',
    baseUrl: 'http://127.0.0.1:11434/v1',
    authRequired: false,
    models: [{ model: 'm' }],
  }]);

  assert.equal(Object.hasOwn(registry.providers[0], 'apiKey'), false);
  assert.equal(Object.hasOwn(registry.providers[0], 'bearerToken'), false);
});

test('selection ids follow PROVIDER/MODEL and map back to the source entries', () => {
  const map = nativeSelectionMap(providers);
  assert.equal(nativeSelectionId('acme', 'reasoner'), 'acme/reasoner');
  assert.ok(map.has('acme/reasoner'));
  assert.equal(map.get('acme/reasoner').provider.id, 'acme');
  assert.equal(map.get('acme/reasoner').model.model, 'reasoner');
});
