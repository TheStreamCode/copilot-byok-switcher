import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  clearDiscoveryCache,
  declaresToolSupport,
  discoverModels,
  readContextWindow,
  readOutputLimit,
} from '../src/discovery.mjs';
import { resolveLiveModels } from '../src/launcher.mjs';

const provider = {
  id: 'acme',
  name: 'Acme',
  baseUrl: 'https://api.acme.test/v1',
  modelsUrl: 'https://api.acme.test/v1/models',
  apiKey: 'secret',
  models: [{ model: 'curated-one', label: 'Curated One', contextWindow: 1000, maxOutputTokens: 100 }],
};

// Discovery caches per session; each test needs to start from a clean slate.
beforeEach(() => clearDiscoveryCache());

function respondWith(payload, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    statusText: 'x',
    headers: { get: () => null },
    json: async () => payload,
  });
}

test('models come from the provider, with its own context and output limits', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith({
      data: [
        { id: 'acme-large', context_length: 262144, max_output_length: 65536, supported_features: ['tools'] },
        { id: 'acme-small', context_length: 32000, max_output_length: 8000, supported_features: ['tools'] },
      ],
    }),
  });

  assert.equal(result.source, 'provider');
  assert.equal(result.models.length, 2);
  const large = result.models.find((model) => model.model === 'acme-large');
  assert.equal(large.contextWindow, 262144);
  assert.equal(large.maxOutputTokens, 65536);
});

test('a model the provider says cannot call tools is left out', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith({
      data: [
        { id: 'acme-chat', supported_features: ['tools'] },
        { id: 'acme-plain', supported_features: ['json_mode'] },
      ],
    }),
  });

  assert.deepEqual(result.models.map((model) => model.model), ['acme-chat']);
});

test('silence about capabilities is not treated as a denial', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith({ data: [{ id: 'acme-unknown' }] }),
  });

  assert.deepEqual(result.models.map((model) => model.model), ['acme-unknown']);
});

test('non-chat models are filtered out', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith({
      data: [
        { id: 'acme-chat' },
        { id: 'text-embedding-3-large' },
        { id: 'whisper-large' },
        { id: 'stable-diffusion-xl' },
      ],
    }),
  });

  assert.deepEqual(result.models.map((model) => model.model), ['acme-chat']);
});

test('the list is capped so one provider cannot flood the picker', async () => {
  const many = Array.from({ length: 50 }, (_, index) => ({ id: `acme-${index}` }));
  const result = await discoverModels(provider, { limit: 5, fetchImpl: respondWith({ data: many }) });

  assert.equal(result.models.length, 5);
});

test('an unreachable provider keeps its shipped list', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });

  assert.equal(result.source, 'catalog');
  assert.match(result.reason, /ECONNREFUSED/);
  assert.deepEqual(result.models, provider.models);
});

test('an error response keeps the shipped list rather than emptying the picker', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith(null, { ok: false, status: 401 }),
  });

  assert.equal(result.source, 'catalog');
  assert.match(result.reason, /401/);
  assert.deepEqual(result.models, provider.models);
});

test('an empty catalog falls back instead of publishing nothing', async () => {
  const result = await discoverModels(provider, { fetchImpl: respondWith({ data: [] }) });

  assert.equal(result.source, 'catalog');
  assert.deepEqual(result.models, provider.models);
});

test('discovery can be turned off per provider', async () => {
  let called = false;
  const result = await discoverModels({ ...provider, discover: false }, {
    fetchImpl: async () => { called = true; return respondWith({ data: [] })(); },
  });

  assert.equal(called, false);
  assert.equal(result.source, 'catalog');
});

test('the credential is sent to the catalog endpoint', async () => {
  let seen;
  await discoverModels(provider, {
    fetchImpl: async (url, options) => {
      seen = { url, auth: options.headers.authorization };
      return respondWith({ data: [{ id: 'x' }] })();
    },
  });

  assert.equal(seen.url, provider.modelsUrl);
  assert.equal(seen.auth, 'Bearer secret');
});

test('capability and limit fields are read under the names providers actually use', () => {
  assert.equal(declaresToolSupport({ supported_parameters: ['tools', 'max_tokens'] }), true);
  assert.equal(declaresToolSupport({ supported_features: ['json_mode'] }), false);
  assert.equal(declaresToolSupport({ capabilities: { supports: { tool_calls: true } } }), true);
  assert.equal(declaresToolSupport({ id: 'plain' }), undefined);

  assert.equal(readContextWindow({ context_length: 128000 }), 128000);
  assert.equal(readContextWindow({ max_model_len: 32000 }), 32000);
  assert.equal(readContextWindow({ top_provider: { context_length: 500000 } }), 500000);
  assert.equal(readContextWindow({}), undefined);

  assert.equal(readOutputLimit({ max_output_length: 4096 }), 4096);
  assert.equal(readOutputLimit({ top_provider: { max_completion_tokens: 8192 } }), 8192);
});

test('providers without a credential are never queried', async () => {
  const asked = [];
  const providers = [
    { ...provider, id: 'with-key' },
    { id: 'no-key', name: 'No Key', models: [], modelsUrl: 'https://x.test/models' },
    { id: 'local', name: 'Local', authRequired: false, models: [], modelsUrl: 'http://127.0.0.1:1/models' },
  ];

  await resolveLiveModels(providers, {
    discoverImpl: async (entry) => {
      asked.push(entry.id);
      return { models: [{ model: 'm' }], source: 'provider' };
    },
  });

  assert.deepEqual(asked, ['with-key', 'local']);
});

test('a provider that fails discovery does not stop the others', async () => {
  const providers = [
    { ...provider, id: 'good' },
    { ...provider, id: 'bad' },
  ];

  const resolved = await resolveLiveModels(providers, {
    discoverImpl: async (entry) => (entry.id === 'bad'
      ? { models: entry.models, source: 'catalog', reason: 'boom' }
      : { models: [{ model: 'fresh' }], source: 'provider' }),
  });

  assert.deepEqual(resolved.find((entry) => entry.id === 'good').models, [{ model: 'fresh' }]);
  assert.deepEqual(resolved.find((entry) => entry.id === 'bad').models, provider.models);
});

test('namespaced ids get a readable label while the id itself is preserved', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith({ data: [{ id: 'Qwen/Qwen3.5-397B-A17B-TEE' }] }),
  });

  const [model] = result.models;
  assert.equal(model.model, 'Qwen/Qwen3.5-397B-A17B-TEE', 'the id must stay exact for routing');
  assert.equal(model.label, 'Qwen3.5-397B-A17B-TEE (Acme)');
});

test('a curated label wins over the generated one', async () => {
  const result = await discoverModels(provider, {
    fetchImpl: respondWith({ data: [{ id: 'curated-one' }] }),
  });

  assert.equal(result.models[0].label, 'Curated One');
});

test('the catalog is fetched once per provider, not on every rebuild', async () => {
  const cache = new Map();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return respondWith({ data: [{ id: 'x' }] })(); };

  await discoverModels(provider, { fetchImpl, cache });
  await discoverModels(provider, { fetchImpl, cache });
  await discoverModels(provider, { fetchImpl, cache });

  assert.equal(calls, 1);
});

test('a failure is cached too, so a broken provider is not retried in a loop', async () => {
  const cache = new Map();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('boom'); };

  await discoverModels(provider, { fetchImpl, cache });
  await discoverModels(provider, { fetchImpl, cache });

  assert.equal(calls, 1);
});

test('the cache expires so new models eventually show up', async () => {
  const cache = new Map();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return respondWith({ data: [{ id: 'x' }] })(); };

  await discoverModels(provider, { fetchImpl, cache, now: () => 0 });
  await discoverModels(provider, { fetchImpl, cache, now: () => 11 * 60 * 1000 });

  assert.equal(calls, 2);
});

test('a transient failure is retried sooner than a good result is refreshed', async () => {
  const cache = new Map();
  let calls = 0;
  const failing = async () => { calls += 1; throw new Error('rate limited'); };

  await discoverModels(provider, { fetchImpl: failing, cache, now: () => 0 });
  await discoverModels(provider, { fetchImpl: failing, cache, now: () => 30_000 });
  assert.equal(calls, 1, 'still cached after 30s');

  await discoverModels(provider, { fetchImpl: failing, cache, now: () => 90_000 });
  assert.equal(calls, 2, 'retried after the short failure window');
});
