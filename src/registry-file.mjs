// File handling for the Copilot CLI's native BYOK registry (providers.json).
//
// Native mode writes a temporary registry for the session and deletes it on
// exit. Legacy mode uses the same writer to hand the CLI an empty registry, so
// a providers.json in the user's config directory cannot silently override the
// COPILOT_PROVIDER_* variables that mode is built on.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { restrictPermissions } from './keystore.mjs';

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
 * Writes a registry to a private temporary directory.
 * @returns {Promise<{path: string, dir: string, cleanup: function(): Promise<void>}>}
 */
export async function createRegistryFile(registry) {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const path = join(dir, 'providers.json');

  await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await restrictPermissions(path);

  return {
    path,
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
