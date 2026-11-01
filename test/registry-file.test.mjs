import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createRegistryFile,
  inspectNativeRegistry,
  nativeRegistryPath,
  sweepStaleRegistries,
} from '../src/registry-file.mjs';

test('writes a registry to a private temp directory and removes it on cleanup', async () => {
  const registry = {
    providers: [{ name: 'acme', baseUrl: 'https://api.acme.test/v1', apiKey: 'secret' }],
    models: [{ id: 'm', provider: 'acme' }],
  };

  const file = await createRegistryFile(registry);
  try {
    assert.deepEqual(JSON.parse(await readFile(file.path, 'utf8')), registry);

    if (process.platform !== 'win32') {
      assert.equal((await stat(file.path)).mode & 0o777, 0o600, 'registry file is owner-only');
      assert.equal((await stat(file.dir)).mode & 0o777, 0o700, 'registry directory is owner-only');
    }

    assert.equal(await file.cleanup(), true);
  } finally {
    await file.cleanup();
  }

  await assert.rejects(() => readFile(file.path, 'utf8'));
});

test('refuses to write keys when permissions cannot be restricted', async () => {
  const base = await mkdtemp(join(tmpdir(), 'copilot-byok-registry-base-'));

  await assert.rejects(
    () => createRegistryFile({ providers: [], models: [] }, { base, restrict: async () => false }),
    /could not restrict permissions/,
  );
  assert.deepEqual(await readdir(base), [], 'the temporary directory is removed');
});

test('sweeps only stale registries from previous sessions', async () => {
  const base = await mkdtemp(join(tmpdir(), 'copilot-byok-registry-base-'));
  const stale = join(base, 'copilot-byok-registry-stale');
  const recent = join(base, 'copilot-byok-registry-recent');
  await mkdir(stale);
  await mkdir(recent);
  await writeFile(join(stale, 'providers.json'), '{}');
  await writeFile(join(recent, 'providers.json'), '{}');

  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await utimes(stale, old, old);

  const removed = await sweepStaleRegistries({ base });
  assert.equal(removed, 1);
  await assert.rejects(() => stat(stale));
  assert.ok(await stat(recent));
});

test('honours COPILOT_PROVIDERS_CONFIG and counts the registry entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-registry-'));
  const path = join(dir, 'custom.json');
  await writeFile(path, JSON.stringify({
    providers: [{ name: 'acme', baseUrl: 'https://api.acme.test/v1' }],
    models: [{ id: 'm', provider: 'acme' }, { id: 'm2', provider: 'acme' }],
  }));

  const inspected = await inspectNativeRegistry({ COPILOT_PROVIDERS_CONFIG: path });
  assert.equal(inspected.path, path);
  assert.equal(inspected.present, true);
  assert.equal(inspected.providers, 1);
  assert.equal(inspected.models, 2);
});

test('an absent registry is reported as absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-registry-'));
  const inspected = await inspectNativeRegistry({ COPILOT_PROVIDERS_CONFIG: join(dir, 'missing.json') });
  assert.equal(inspected.present, false);
  assert.equal(inspected.providers, 0);
  assert.equal(inspected.models, 0);
});

test('invalid JSON is reported instead of thrown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-registry-'));
  const path = join(dir, 'broken.json');
  await writeFile(path, '{broken');

  const inspected = await inspectNativeRegistry({ COPILOT_PROVIDERS_CONFIG: path });
  assert.equal(inspected.present, true);
  assert.match(inspected.error, /invalid JSON/);
});

test('the default path follows COPILOT_HOME', () => {
  assert.equal(
    nativeRegistryPath({ COPILOT_HOME: 'C:\\copilot-home' }),
    join('C:\\copilot-home', 'providers.json'),
  );
  assert.equal(
    nativeRegistryPath({ COPILOT_PROVIDERS_CONFIG: '/tmp/custom.json' }),
    '/tmp/custom.json',
  );
});
