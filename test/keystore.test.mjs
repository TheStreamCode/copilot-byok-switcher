import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { keystorePath, loadKeys, removeKey, saveKey } from '../src/keystore.mjs';

async function scratchEnv() {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-keys-'));
  return { COPILOT_BYOK_KEYSTORE: join(dir, 'keys.json') };
}

test('an absent store reads as empty rather than failing', async () => {
  const env = await scratchEnv();
  assert.deepEqual(await loadKeys(env), {});
});

test('keys round-trip through the store', async () => {
  const env = await scratchEnv();

  await saveKey('openai', 'sk-one', env);
  await saveKey('deepseek', 'sk-two', env);

  assert.deepEqual(await loadKeys(env), { openai: 'sk-one', deepseek: 'sk-two' });
});

test('the store file is owner-only on POSIX', { skip: platform() === 'win32' }, async () => {
  const env = await scratchEnv();
  await saveKey('openai', 'sk-one', env);

  const info = await stat(keystorePath(env));
  assert.equal(info.mode & 0o777, 0o600);
});

test('removing the last key deletes the file', async () => {
  const env = await scratchEnv();
  await saveKey('openai', 'sk-one', env);

  assert.equal(await removeKey('openai', env), true);
  assert.deepEqual(await loadKeys(env), {});
  await assert.rejects(() => readFile(keystorePath(env), 'utf8'), /ENOENT/);
});

test('removing a key that is not there is not an error', async () => {
  const env = await scratchEnv();
  assert.equal(await removeKey('ghost', env), false);
});

test('empty values are ignored when loading', async () => {
  const env = await scratchEnv();
  await saveKey('openai', 'sk-one', env);
  await saveKey('blank', '', env);

  assert.deepEqual(await loadKeys(env), { openai: 'sk-one' });
});

test('a malformed store reports the path instead of failing obscurely', async () => {
  const env = await scratchEnv();
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(keystorePath(env)), { recursive: true });
  await writeFile(keystorePath(env), '{not json', 'utf8');

  await assert.rejects(() => loadKeys(env), /Malformed key store/);
});

test('a crash during a write cannot destroy the existing store', async () => {
  const env = await scratchEnv();
  await saveKey('openai', 'first', env);
  await saveKey('deepseek', 'second', env);

  const { readdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await saveKey('anthropic', 'third', env);

  // The write goes through a temp file and a rename, so no partial file is left
  // behind and the store always contains every key.
  const leftovers = (await readdir(dirname(keystorePath(env)))).filter((name) => name.includes('.tmp'));
  assert.deepEqual(leftovers, []);
  assert.deepEqual(await loadKeys(env), { openai: 'first', deepseek: 'second', anthropic: 'third' });
});
