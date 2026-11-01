// File handling for the Copilot CLI's native BYOK registry (providers.json).
//
// Native mode writes a temporary registry for the session and deletes it on
// exit. Legacy mode uses the same writer to hand the CLI an empty registry, so
// a providers.json in the user's config directory cannot silently override the
// COPILOT_PROVIDER_* variables that mode is built on.
//
// The directory is locked down before the file exists: on Windows the file mode
// is advisory, and a registry holding provider keys must not rely on the ACL of
// a shared temp directory. If the owner-only restriction cannot be applied the
// writer refuses to keep the keys on disk.

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { restrictPermissions } from './keystore.mjs';

const REGISTRY_DIR_PREFIX = 'copilot-byok-registry-';
const STALE_REGISTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Where the CLI looks for the registry, honouring its own overrides. */
export function nativeRegistryPath(env = process.env) {
  if (env.COPILOT_PROVIDERS_CONFIG) return env.COPILOT_PROVIDERS_CONFIG;
  const home = env.COPILOT_HOME || join(homedir(), '.copilot');
  return join(home, 'providers.json');
}

/**
 * Reads the registry the CLI would load. Never returns credentials.
 * @returns {Promise<{path: string, present: boolean, providers: number, models: number, error?: string}>}
 */
export async function inspectNativeRegistry(env = process.env) {
  const path = nativeRegistryPath(env);
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { path, present: false, providers: 0, models: 0 };
    return { path, present: false, providers: 0, models: 0, error: error.message };
  }

  try {
    const parsed = JSON.parse(contents);
    return {
      path,
      present: true,
      providers: Array.isArray(parsed?.providers) ? parsed.providers.length : 0,
      models: Array.isArray(parsed?.models) ? parsed.models.length : 0,
    };
  } catch (error) {
    return { path, present: true, providers: 0, models: 0, error: `invalid JSON: ${error.message}` };
  }
}

/**
 * Writes a registry to a private temporary directory. The directory is
 * restricted before the file is created; a false from the restriction helper is
 * a hard failure, because provider keys must not end up in a shared temp path.
 * @returns {Promise<{path: string, dir: string, cleanup: function(): Promise<boolean>}>}
 */
export async function createRegistryFile(registry, { restrict = restrictPermissions, base = tmpdir() } = {}) {
  const dir = await mkdtemp(join(base, REGISTRY_DIR_PREFIX));
  const path = join(dir, 'providers.json');

  try {
    if (!await restrict(dir, { mode: 0o700 })) {
      throw new Error(`could not restrict permissions on ${dir}; refusing to write provider keys there`);
    }

    await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

    if (!await restrict(path)) {
      throw new Error(`could not restrict permissions on ${path}; refusing to keep provider keys there`);
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return {
    path,
    dir,
    async cleanup() {
      try {
        await rm(dir, { recursive: true, force: true });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Removes registries left behind by a session that could not clean up (SIGKILL,
 * power loss). Only directories created by this module older than a week are
 * touched, so a concurrent session is never removed.
 * @returns {Promise<number>} directories removed
 */
export async function sweepStaleRegistries({
  base = tmpdir(),
  now = Date.now(),
  maxAgeMs = STALE_REGISTRY_AGE_MS,
} = {}) {
  let removed = 0;
  const entries = await readdir(base, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(REGISTRY_DIR_PREFIX)) continue;
    const path = join(base, entry.name);
    const info = await stat(path).catch(() => null);
    if (!info || now - info.mtimeMs < maxAgeMs) continue;
    if (await rm(path, { recursive: true, force: true }).then(() => true, () => false)) removed += 1;
  }

  return removed;
}
