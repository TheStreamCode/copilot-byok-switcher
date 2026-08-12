// Optional local key store.
//
// Environment variables remain the primary and recommended source: this file is a
// convenience for people who would otherwise juggle a dozen `setx` calls. Keys
// stored here sit on disk in plain text, protected by file permissions only, so
// the store is created lazily and never used unless the user asks for it.
//
// Lookup order is always: environment variable first, store second.

import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

import spawn from 'cross-spawn';

const FILE_NAME = 'keys.json';

export function keystorePath(env = process.env) {
  if (env.COPILOT_BYOK_KEYSTORE) return env.COPILOT_BYOK_KEYSTORE;

  if (platform() === 'win32' && env.APPDATA) {
    return join(env.APPDATA, 'copilot-byok', FILE_NAME);
  }

  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'copilot-byok', FILE_NAME);
}

/** @returns {Promise<Record<string, string>>} provider id -> key, empty when absent. */
export async function loadKeys(env = process.env) {
  try {
    const contents = await readFile(keystorePath(env), 'utf8');
    const parsed = JSON.parse(contents);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.length > 0)
    );
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) {
      throw new Error(`Malformed key store at ${keystorePath(env)}: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

export async function saveKey(providerId, key, env = process.env) {
  const keys = await loadKeys(env);
  keys[providerId] = key;
  await writeKeys(keys, env);
}

export async function removeKey(providerId, env = process.env) {
  const keys = await loadKeys(env);
  if (!(providerId in keys)) return false;

  delete keys[providerId];
  if (Object.keys(keys).length === 0) {
    await rm(keystorePath(env), { force: true });
    return true;
  }

  await writeKeys(keys, env);
  return true;
}

async function writeKeys(keys, env) {
  const path = keystorePath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(keys, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await restrictPermissions(path);
}

/**
 * Owner-only access. POSIX gets 0600; Windows needs an explicit ACL because file
 * modes are advisory there and inherited permissions would otherwise apply.
 * @returns {Promise<boolean>} false when the restriction could not be applied.
 */
export async function restrictPermissions(path) {
  if (platform() !== 'win32') {
    try {
      await chmod(path, 0o600);
      return true;
    } catch {
      return false;
    }
  }

  const user = process.env.USERNAME
    ? `${process.env.USERDOMAIN || process.env.COMPUTERNAME || '.'}\\${process.env.USERNAME}`
    : null;
  if (!user) return false;

  return new Promise((resolve) => {
    const child = spawn('icacls', [path, '/inheritance:r', '/grant:r', `${user}:F`], {
      stdio: 'ignore',
      shell: false,
    });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}
