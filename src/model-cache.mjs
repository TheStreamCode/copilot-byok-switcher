// Remembers the last model list each provider actually returned.
//
// When discovery fails — a rate limit, a network blip, an expired key — falling
// back to the shipped list is misleading: that list is generic, while a provider's
// catalog is specific to the plan behind the key. It can therefore offer models the
// user does not have (a Kimi entry on an Alibaba plan that never included it) and
// omit ones they do. Yesterday's real answer is a far better guess than a generic
// list, so it is kept on disk and preferred over it.

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function cachePath(env = process.env) {
  if (env.COPILOT_BYOK_MODEL_CACHE) return env.COPILOT_BYOK_MODEL_CACHE;

  if (platform() === 'win32' && env.LOCALAPPDATA) {
    return join(env.LOCALAPPDATA, 'copilot-byok', 'models.json');
  }

  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'copilot-byok', 'models.json');
}

/** @returns {Promise<Record<string, {at: number, models: object[]}>>} */
export async function readCache(env = process.env) {
  try {
    const parsed = JSON.parse(await readFile(cachePath(env), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function rememberModels(providerId, models, env = process.env, now = Date.now) {
  if (!Array.isArray(models) || models.length === 0) return;

  const cache = await readCache(env);
  cache[providerId] = { at: now(), models };
  await writeCache(cache, env);
}

/** The remembered list, unless it is old enough to be more misleading than useful. */
export function recallModels(cache, providerId, now = Date.now) {
  const entry = cache?.[providerId];
  if (!entry || !Array.isArray(entry.models) || entry.models.length === 0) return null;
  if (now() - entry.at > MAX_AGE_MS) return null;
  return entry.models;
}

async function writeCache(cache, env) {
  const path = cachePath(env);
  await mkdir(dirname(path), { recursive: true });

  // Same temp-and-rename as the key store: an interrupted write must not leave a
  // truncated cache behind.
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
