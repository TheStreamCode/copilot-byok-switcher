// `copilot-byok doctor` - one command that reports the state of the install.
//
// It never starts Copilot and never prints a credential: each check reports
// whether something is present, not its value. Exit code 0 when nothing failed,
// 1 when at least one check failed, so it can gate a script.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import spawn from 'cross-spawn';

import { extractConfigPath } from './argv-config.mjs';
import { resolveCopilotBin } from './copilot-bin.mjs';
import { loadConfig } from './config.mjs';
import { extensionDir } from './extension-install.mjs';
import { isQueryable, resolveLiveModels } from './launcher.mjs';
import { cachePath, readCache } from './model-cache.mjs';
import { nativeRegistryPath, inspectNativeRegistry } from './registry-file.mjs';
import { keystorePath, loadKeys } from './keystore.mjs';
import { logPath } from './session-log.mjs';
import { shimDir } from './shim-install.mjs';
import { dataResidencyOrigin } from './upstream.mjs';

const MINIMUM_COPILOT_CLI = '1.0.79';

export function detectCopilotVersion(bin, env) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, ['--version'], {
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      resolve(null);
      return;
    }

    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 15_000);

    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      const match = /(\d+\.\d+\.\d+)/.exec(output);
      resolve(match ? match[1] : null);
    });
  });
}

export async function runDoctorCommand({ argv = [], io, probeVersion = detectCopilotVersion }) {
  const args = { json: false, online: false, configPath: null, help: false };
  const rest = [...argv];
  args.configPath = extractConfigPath(rest);

  for (const arg of rest) {
    if (arg === '--json') args.json = true;
    else if (arg === '--online') args.online = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown doctor option: ${arg}`);
  }

  if (args.help) {
    io.stdout.write(doctorHelpText());
    return 0;
  }

  const checks = [];
  const add = (level, name, detail) => checks.push({ level, name, detail });

  await checkNode(add);
  await checkCopilot({ add, io, probeVersion });
  const { config, secrets } = await checkConfig({ add, io, configPath: args.configPath });

  if (config) {
    checkProviders({ add, config });
    if (args.online) await checkOnline({ add, config, io });
  }

  checkKeystore({ add, secrets, env: io.env });
  await checkNativeRegistry({ add, env: io.env });
  await checkPaths({ add, env: io.env });
  await checkShim({ add, env: io.env });
  await checkExtension({ add, env: io.env });
  checkDataResidency({ add, env: io.env });

  const failed = checks.filter((check) => check.level === 'fail').length;
  if (args.json) {
    io.stdout.write(`${JSON.stringify({ ok: failed === 0, checks }, null, 2)}\n`);
  } else {
    for (const check of checks) io.stdout.write(`${formatCheck(check)}\n`);
    io.stdout.write(`\n${failed === 0 ? 'No failures.' : `${failed} check(s) failed.`}\n`);
  }

  return failed === 0 ? 0 : 1;
}

function formatCheck({ level, name, detail }) {
  const tag = level === 'fail' ? 'FAIL' : level === 'warn' ? 'WARN' : 'ok  ';
  return `${tag} ${name}: ${detail}`;
}

async function checkNode(add) {
  const minimum = await readEngineMinimum();
  const current = process.versions.node;
  if (minimum && !versionAtLeast(current, minimum)) {
    add('fail', 'node', `${current}, the package needs ${minimum} or newer`);
    return;
  }
  add('ok', 'node', minimum ? `${current} (minimum ${minimum})` : current);
}

async function checkCopilot({ add, io, probeVersion }) {
  const bin = resolveCopilotBin({ env: io.env });
  const version = await probeVersion(bin, io.env);
  if (!version) {
    add('warn', 'copilot', `${bin} did not answer --version; set COPILOT_BIN if the path is wrong`);
    return;
  }

  if (!versionAtLeast(version, MINIMUM_COPILOT_CLI)) {
    add('warn', 'copilot', `${version} at ${bin}; this project targets ${MINIMUM_COPILOT_CLI} or newer`);
    return;
  }

  add('ok', 'copilot', `${version} at ${bin}`);
}

async function checkConfig({ add, io, configPath }) {
  let secrets = {};
  try {
    secrets = await loadKeys(io.env);
  } catch (error) {
    add('fail', 'key store', error.message);
  }

  try {
    const config = await loadConfig({ configPath, env: io.env, secrets });
    add('ok', 'config', `${config.providers.length} providers`);
    return { config, secrets };
  } catch (error) {
    add('fail', 'config', error.message);
    return { config: null, secrets };
  }
}

function checkProviders({ add, config }) {
  const active = config.providers.filter(isQueryable);
  const missing = config.providers
    .filter((provider) => provider.authRequired !== false && !provider.apiKey && !provider.bearerToken)
    .map((provider) => provider.id);

  add(active.length > 0 ? 'ok' : 'warn', 'providers', `${active.length} of ${config.providers.length} have a credential`);
  if (missing.length > 0 && active.length === 0) {
    add('warn', 'credentials', `set a key for one of: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', ...' : ''}`);
  }
}

async function checkOnline({ add, config, io }) {
  try {
    const providers = await resolveLiveModels(config.providers, { env: io.env });
    const withModels = providers.filter((provider) => provider.models?.length);
    add('ok', 'discovery', `${withModels.length} providers returned models`);
  } catch (error) {
    add('warn', 'discovery', error.message);
  }
}

function checkKeystore({ add, secrets, env }) {
  const stored = Object.keys(secrets).length;
  add('ok', 'key store', `${keystorePath(env)}${stored > 0 ? ` (${stored} stored keys)` : ' (empty)'}`);
}

async function checkNativeRegistry({ add, env }) {
  const native = await inspectNativeRegistry(env);
  if (native.error) {
    add('warn', 'native registry', `${native.path}: ${native.error}`);
    return;
  }
  if (!native.present) {
    add('ok', 'native registry', `${nativeRegistryPath(env)} (not present)`);
    return;
  }
  add(
    native.providers + native.models > 0 ? 'warn' : 'ok',
    'native registry',
    `${native.path}: ${native.providers} providers, ${native.models} models${native.providers + native.models > 0 ? ' (takes precedence over COPILOT_PROVIDER_*)' : ''}`,
  );
}

async function checkPaths({ add, env }) {
  const cache = await readCache(env).catch(() => ({}));
  add('ok', 'model cache', `${nativeCount(cache)} providers remembered at ${cachePath(env)}`);

  const log = await stat(logPath(env)).catch(() => null);
  add('ok', 'router log', log ? `${logPath(env)} (${log.size} bytes)` : `${logPath(env)} (not created yet)`);
}

async function checkShim({ add, env }) {
  const dir = shimDir(env);
  const entries = await readdir(dir).catch(() => []);
  const hasShim = entries.includes('copilot') || entries.includes('copilot.cmd');
  add(hasShim ? 'ok' : 'warn', 'shim', hasShim ? dir : `not installed (${dir})`);
}

async function checkExtension({ add, env }) {
  const dir = extensionDir(env);
  try {
    await readFile(join(dir, 'extension.mjs'), 'utf8');
    add('ok', 'extension', `installed at ${dir}`);
  } catch {
    add('warn', 'extension', 'not installed; /byok is unavailable');
  }
}

function checkDataResidency({ add, env }) {
  const origin = dataResidencyOrigin(env);
  add('ok', 'upstream', origin ? `data residency: ${origin}` : 'public GitHub Copilot hosts');
}

function nativeCount(cache) {
  return Object.keys(cache || {}).length;
}

async function readEngineMinimum() {
  try {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const match = /(\d+\.\d+\.\d+)/.exec(manifest.engines?.node || '');
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function versionAtLeast(current, minimum) {
  const [a, b, c] = current.split('.').map(Number);
  const [x, y, z] = minimum.split('.').map(Number);
  if ([a, b, c].some((value) => !Number.isInteger(value))) return false;
  if (a !== x) return a > x;
  if (b !== y) return b > y;
  return c >= z;
}

function doctorHelpText() {
  return `copilot-byok doctor - report the state of the installation

Usage:
  copilot-byok doctor [--json] [--online] [--config <path>]

Options:
      --json        Machine-readable output
      --online      Also query the providers that have a key
  -c, --config <path>  Provider configuration file
  -h, --help        Show this help
`;
}
