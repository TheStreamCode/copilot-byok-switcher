import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cachePath, readCache, recallModels, rememberModels } from '../src/model-cache.mjs';
import { discoverModels } from '../src/discovery.mjs';

async function scratchEnv() {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-modelcache-'));
  return { COPILOT_BYOK_MODEL_CACHE: join(dir, 'models.json') };
}

const provider = {
  id: 'acme',
  name: 'Acme',
  baseUrl: 'https://api.acme.test/v1',
  modelsUrl: 'https://api.acme.test/v1/models',
  apiKey: 'secret',
  // The shipped list is generic and may name models this key cannot use.
  models: [{ model: 'generic-model', label: 'Generic' }],
};

test('an absent cache reads as empty', async () => {
  assert.deepEqual(await readCache(await scratchEnv()), {});
});

test('models survive a round trip', async () => {
  const env = await scratchEnv();
  await rememberModels('acme', [{ model: 'real-one' }, { model: 'real-two' }], env);

  const cache = await readCache(env);
  assert.deepEqual(recallModels(cache, 'acme').map((m) => m.model), ['real-one', 'real-two']);
});

test('an empty list is not remembered, so it cannot erase a good one', async () => {
  const env = await scratchEnv();
  await rememberModels('acme', [{ model: 'real' }], env);
  await rememberModels('acme', [], env);

  assert.equal(recallModels(await readCache(env), 'acme').length, 1);
});

test('a stale entry is ignored rather than offered as current', async () => {
  const env = await scratchEnv();
  await rememberModels('acme', [{ model: 'old' }], env, () => 0);

  const cache = await readCache(env);
  const fortyDays = 40 * 24 * 60 * 60 * 1000;
  assert.equal(recallModels(cache, 'acme', () => fortyDays), null);
  assert.ok(recallModels(cache, 'acme', () => 1000));
});

test('a failed discovery offers what the key really returned, not the shipped list', async () => {
  const env = await scratchEnv();
  await rememberModels('acme', [{ model: 'yours-1' }, { model: 'yours-2' }], env);
  const diskCache = await readCache(env);

  const result = await discoverModels(provider, {
    fetchImpl: async () => { throw new Error('401 Unauthorized'); },
    cache: new Map(),
    diskCache,
    env,
  });

  assert.equal(result.source, 'remembered');
  assert.deepEqual(result.models.map((m) => m.model), ['yours-1', 'yours-2']);
  assert.ok(!result.models.some((m) => m.model === 'generic-model'),
    'a generic entry could name a model this plan does not include');
});

test('without a remembered list the shipped one is still used', async () => {
  const env = await scratchEnv();

  const result = await discoverModels(provider, {
    fetchImpl: async () => { throw new Error('down'); },
    cache: new Map(),
    diskCache: await readCache(env),
    env,
  });

  assert.equal(result.source, 'catalog');
  assert.deepEqual(result.models.map((m) => m.model), ['generic-model']);
});

test('a successful discovery updates what is remembered', async () => {
  const env = await scratchEnv();

  await discoverModels(provider, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: [{ id: 'fresh-one' }] }),
    }),
    cache: new Map(),
    diskCache: await readCache(env),
    env,
  });

  assert.deepEqual(recallModels(await readCache(env), 'acme').map((m) => m.model), ['fresh-one']);
});

test('the cache is written atomically, leaving no partial files', async () => {
  const env = await scratchEnv();
  await rememberModels('acme', [{ model: 'x' }], env);

  const { dirname } = await import('node:path');
  const entries = await readdir(dirname(cachePath(env)));
  assert.deepEqual(entries.filter((name) => name.includes('.tmp')), []);
});
