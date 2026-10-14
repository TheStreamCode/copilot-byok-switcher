import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveOfflineModels, startRouter } from '../src/launcher.mjs';
import { rememberModels } from '../src/model-cache.mjs';

const base = {
  id: 'acme',
  name: 'Acme',
  baseUrl: 'https://api.acme.test/v1',
  models: [{ model: 'acme-large' }],
};

test('the catalog picks up providers that gain a key mid-session', async () => {
  let providers = [{ ...base }]; // no key yet: nothing to publish

  const router = await startRouter({
    providers,
    upstreamOrigin: 'https://upstream.invalid',
    reload: async () => providers,
  });

  try {
    assert.equal(router.catalog.entries.length, 0);

    // The /byok extension writes a key; the next reload must see it.
    providers = [{ ...base, apiKey: 'added-later' }];

    const refreshed = await router.currentCatalog();
    assert.equal(refreshed.entries.length, 1);
    assert.equal(refreshed.entries[0].vendor, 'Acme');
  } finally {
    await router.close();
  }
});

test('rebuilds are throttled so they do not run on every request', async () => {
  let reloads = 0;

  const router = await startRouter({
    providers: [{ ...base, apiKey: 'k' }],
    upstreamOrigin: 'https://upstream.invalid',
    reload: async () => { reloads += 1; return [{ ...base, apiKey: 'k' }]; },
  });

  try {
    await router.currentCatalog();
    await router.currentCatalog();
    await router.currentCatalog();
    assert.equal(reloads, 1, 'calls within the throttle window reuse the cached catalog');
  } finally {
    await router.close();
  }
});

test('a failing reload keeps the previous catalog instead of breaking the session', async () => {
  const events = [];

  const router = await startRouter({
    providers: [{ ...base, apiKey: 'k' }],
    upstreamOrigin: 'https://upstream.invalid',
    onEvent: (event) => events.push(event),
    reload: async () => { throw new Error('config went missing'); },
  });

  try {
    const catalog = await router.currentCatalog();
    assert.equal(catalog.entries.length, 1);
    assert.match(events.at(-1).message, /catalog reload failed/);
  } finally {
    await router.close();
  }
});

test('the router binds to loopback only', async () => {
  const router = await startRouter({
    providers: [{ ...base, apiKey: 'k' }],
    upstreamOrigin: 'https://upstream.invalid',
  });

  try {
    assert.match(router.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  } finally {
    await router.close();
  }
});

test('offline mode uses remembered lists without contacting providers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-offline-'));
  const env = { COPILOT_BYOK_MODEL_CACHE: join(dir, 'models.json') };
  await rememberModels('acme', [{ model: 'yours-1' }], env);

  const resolved = await resolveOfflineModels([
    { id: 'acme', name: 'Acme', models: [] },
    { id: 'pinned', name: 'Pinned', models: [{ model: 'fixed-one' }] },
    { id: 'unknown', name: 'Unknown', models: [] },
  ], { env });

  assert.deepEqual(resolved.find((entry) => entry.id === 'acme').models.map((model) => model.model), ['yours-1']);
  assert.deepEqual(resolved.find((entry) => entry.id === 'pinned').models.map((model) => model.model), ['fixed-one']);
  assert.deepEqual(resolved.find((entry) => entry.id === 'unknown').models, []);
});
