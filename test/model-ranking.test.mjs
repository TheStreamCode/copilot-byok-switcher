import assert from 'node:assert/strict';
import test from 'node:test';

import { rankModels } from '../src/model-ranking.mjs';

test('ranks latest tool-capable text models with deterministic tie-breaks', () => {
  const models = rankModels({
    requireToolSupport: true,
    payload: {
      data: [
        {
          id: 'vendor/flux-image-model',
          created: 200,
          supported_features: ['tools'],
          input_modalities: ['text'],
          context_length: 262144,
        },
        {
          id: 'vendor/kimi-k2.5',
          created: 200,
          supported_features: ['tools'],
          input_modalities: ['text'],
          context_length: 262144,
        },
        {
          id: 'vendor/kimi-k2.6',
          created: 200,
          supported_features: ['tools'],
          input_modalities: ['text'],
          context_length: 131072,
        },
        {
          id: 'vendor/deepseek-v4-pro',
          created: 300,
          supported_features: ['tools'],
          input_modalities: ['text'],
          context_length: 65536,
        },
        {
          id: 'vendor/new-no-tools',
          created: 400,
          supported_features: ['json_mode'],
          input_modalities: ['text'],
          context_length: 65536,
        },
      ],
    },
  });

  assert.deepEqual(models.slice(0, 3), [
    'vendor/deepseek-v4-pro',
    'vendor/kimi-k2.6',
    'vendor/kimi-k2.5',
  ]);
});

test('uses model name version as a tie-break when provider timestamps are equal', () => {
  const models = rankModels({
    payload: {
      data: [
        { id: 'minimax-m2.5', created: 100, owned_by: 'opencode' },
        { id: 'minimax-m2.7', created: 100, owned_by: 'opencode' },
        { id: 'kimi-k2.6', created: 100, owned_by: 'opencode' },
      ],
    },
  });

  assert.deepEqual(models.slice(0, 3), ['minimax-m2.7', 'minimax-m2.5', 'kimi-k2.6']);
});

test('does not reject minimal model catalogs when tool metadata is absent', () => {
  const models = rankModels({
    requireToolSupport: true,
    payload: {
      data: [
        { id: 'provider/embedding-model', created: 300 },
        { id: 'provider/kimi-k2.6', created: 200 },
        { id: 'provider/deepseek-v4-pro', created: 100 },
      ],
    },
  });

  assert.deepEqual(models, ['provider/kimi-k2.6', 'provider/deepseek-v4-pro']);
});

test('honors requireToolSupport only when it is enabled', () => {
  const payload = [{ id: 'chat-model', supported_features: ['json_mode'], state: 'ready' }];

  assert.deepEqual(rankModels({ payload, requireToolSupport: false }), ['chat-model']);
  assert.deepEqual(rankModels({ payload, requireToolSupport: true }), []);
});

test('accepts array catalogs and case-insensitive ready status values', () => {
  const models = rankModels({
    payload: [
      { id: 'model-b', state: 'ready', status: { code: 'ok' } },
      { id: 'model-a', state: 'failed', status: { code: 'ok' } },
    ],
  });

  assert.deepEqual(models, ['model-b']);
});

test('understands OpenRouter modalities and tool parameter metadata', () => {
  const models = rankModels({
    payload: {
      data: [
        {
          id: 'vendor/tool-model',
          architecture: { input_modalities: ['text'] },
          supported_parameters: ['tools', 'reasoning'],
        },
        {
          id: 'vendor/image-only',
          architecture: { input_modalities: ['image'] },
          supported_parameters: ['tools'],
        },
        {
          id: 'vendor/chat-only',
          architecture: { input_modalities: ['text'] },
          supported_parameters: ['temperature'],
        },
      ],
    },
    requireToolSupport: true,
  });

  assert.deepEqual(models, ['vendor/tool-model']);
});
