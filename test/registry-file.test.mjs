import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createRegistryFile,
  inspectNativeRegistry,
  nativeRegistryPath,
} from '../src/registry-file.mjs';

test('writes a registry to a private temp directory and removes it on cleanup', async () => {
  const registry = {
    providers: [{ name: 'acme', baseUrl: 'https://api.acme.test/v1', apiKey: 'secret' }],
    models: [{ id: 'm', provider: 'acme' }],
  };

  const file = await createRegistryFile(registry);
  try {
    assert.deepEqual(JSON.parse(await readFile(file.path, 'utf8')), registry);
  } finally {
    await file.cleanup();
  }

  await assert.rejects(() => readFile(file.path, 'utf8'));
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
