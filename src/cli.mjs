import { readFile } from 'node:fs/promises';
import readline from 'node:readline/promises';

import spawn from 'cross-spawn';

import { parseArgs } from './args.mjs';
import { resolveCopilotBin } from './copilot-bin.mjs';
import { findProvider, loadConfig } from './config.mjs';
import { rankModels } from './model-ranking.mjs';
import { buildProviderEnvironment } from './provider-env.mjs';
import { sanitizeCopilotEnvironment } from './process-env.mjs';
import { runCopilotWithRouter, selectActiveProviders, startRouter } from './launcher.mjs';
import { runKeysCommand } from './keys-command.mjs';
import { loadKeys } from './keystore.mjs';
import { runExtensionCommand } from './extension-install.mjs';

const DEFAULT_MODEL_FETCH_TIMEOUT_MS = 10_000;
const MAX_MODEL_CATALOG_BYTES = 5 * 1024 * 1024;

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  // `keys` is a subcommand, not a flag: it manages credentials and never starts Copilot.
  if (argv[0] === 'keys') {
    const rest = argv.slice(1);
    const configPath = extractConfigPath(rest);
    const config = await loadConfig({ configPath, env: io.env, secrets: await loadKeys(io.env) });
    return runKeysCommand({ argv: rest, config, io });
  }

  // `extension` installs the in-session /byok command.
  if (argv[0] === 'extension') {
    return runExtensionCommand({ argv: argv.slice(1), io });
  }

  const args = parseArgs(argv);

  if (args.help) {
    io.stdout.write(helpText());
    return 0;
  }

  if (args.version) {
    io.stdout.write(`${await readPackageVersion()}\n`);
    return 0;
  }

  if (args.providerName === 'native') {
    const config = await loadConfigForSanitization({ configPath: args.configPath, env: io.env });
    const copilotArgs = [...args.copilotArgs];
    if (args.explicitModel) copilotArgs.unshift('--model', args.explicitModel);
    return runCopilot({ copilotArgs, env: {}, io, dryRun: args.dryRun, native: true, config });
  }

  const secrets = await loadKeys(io.env);

  if (args.listProviders) {
    const config = await loadConfig({ configPath: args.configPath, env: io.env, secrets });
    return listProviders({ config, io });
  }

  if (!args.legacy) {
    const config = await loadConfig({ configPath: args.configPath, env: io.env, secrets });
    return runRouterMode({ args, config, io });
  }

  return runLegacyMode({ args, io });
}

/** Default mode: BYOK models show up in the /model picker next to the GitHub ones. */
async function runRouterMode({ args, config, io }) {
  const active = selectActiveProviders(config.providers);

  if (active.length === 0) {
    io.stderr.write(
      'No BYOK provider configured: starting Copilot with GitHub models only.\n' +
      'Run "copilot-byok --list-providers" to see which environment variables to set.\n\n'
    );
    return runCopilot({ copilotArgs: args.copilotArgs, env: {}, io, dryRun: args.dryRun, native: true, config });
  }

  const router = await startRouter({
    providers: config.providers,
    upstreamOrigin: args.upstream || io.env.COPILOT_BYOK_UPSTREAM,
    onEvent: buildEventLogger(io),
    // Re-read config and key store so a key added mid-session (via /byok)
    // shows up in the picker without restarting.
    reload: async () => {
      const secrets = await loadKeys(io.env);
      const fresh = await loadConfig({ configPath: args.configPath, env: io.env, secrets });
      return fresh.providers;
    },
  });

  const modelCount = router.catalog.entries.length;
  io.stderr.write(
    `copilot-byok: added ${modelCount} models from ${router.providers.length} providers to the /model picker\n`
  );

  const copilotArgs = [...args.copilotArgs];
  if (args.explicitModel) copilotArgs.unshift('--model', args.explicitModel);

  if (args.dryRun) {
    io.stdout.write(`${JSON.stringify({
      mode: 'router',
      routerUrl: router.url,
      providers: router.providers.map((provider) => provider.id),
      models: router.catalog.entries.map((entry) => entry.id),
      args: copilotArgs,
    }, null, 2)}\n`);
    await router.close();
    return 0;
  }

  try {
    return await runCopilotWithRouter({ routerUrl: router.url, copilotArgs, env: {}, config, io });
  } finally {
    await router.close();
  }
}

function listProviders({ config, io }) {
  const active = new Set(selectActiveProviders(config.providers).map((provider) => provider.id));

  for (const provider of config.providers) {
    const usable = active.has(provider.id);
    const keys = (provider.apiKeyEnv || []).join(' | ') || (provider.authRequired === false ? 'no key needed' : '-');
    io.stdout.write(`${usable ? '*' : ' '} ${provider.id.padEnd(20)} ${String(provider.models?.length || 0).padStart(2)} models  ${keys}\n`);
  }

  io.stdout.write('\n* = usable right now. The others are waiting for the environment variable shown.\n');
  return 0;
}

function buildEventLogger(io) {
  return (event) => {
    if (event.type === 'error') io.stderr.write(`copilot-byok: ${event.message}\n`);
    if (event.type === 'route' && io.env.COPILOT_BYOK_DEBUG) {
      io.stderr.write(`copilot-byok: ${event.provider} -> ${event.model}\n`);
    }
  };
}

/** Classic mode: one provider per session, without the GitHub models. */
async function runLegacyMode({ args, io }) {
  const config = await loadConfig({ configPath: args.configPath, env: io.env, secrets: await loadKeys(io.env) });
  const provider = await resolveProvider({ config, requested: args.providerName, io });

  if (provider === 'native') {
    if (args.offline || args.wireApi) {
      throw new Error('--offline and --wire-api require a BYOK provider');
    }
    const copilotArgs = [...args.copilotArgs];
    if (args.explicitModel) copilotArgs.unshift('--model', args.explicitModel);
    return runCopilot({ copilotArgs, env: {}, io, dryRun: args.dryRun, native: true, config });
  }

  if (!args.listModels && provider.authRequired !== false && !provider.apiKey && !provider.bearerToken) {
    throw new Error(`Missing API key for ${provider.name}. Configure an environment variable listed in the provider's apiKeyEnv or bearerTokenEnv setting.`);
  }

  if (args.wireApi && provider.type === 'anthropic') {
    throw new Error('--wire-api is available only for OpenAI-compatible BYOK providers');
  }

  const models = args.explicitModel ? [] : await loadProviderModels(provider, io, { strict: args.listModels });

  if (args.listModels) {
    models.forEach((model, index) => io.stdout.write(`${String(index + 1).padStart(3)}) ${model}\n`));
    return 0;
  }

  const wireModel = args.explicitModel || await selectModel({ provider, models, noPrompt: args.noModelPrompt, io });
  const effectiveProvider = args.wireApi ? { ...provider, wireApi: args.wireApi } : provider;
  const env = buildProviderEnvironment({ provider: effectiveProvider, wireModel, offline: args.offline });
  return runCopilot({ copilotArgs: args.copilotArgs, env, io, dryRun: args.dryRun, provider, wireModel, config });
}

function defaultIo() {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
  };
}

/**
 * Subcommands are dispatched before the argument parser runs, so they pick up
 * --config here. Without this, anyone with a custom catalog could not store a key
 * for a provider defined only in it.
 */
function extractConfigPath(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' || arg === '-c') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a file path`);
      argv.splice(index, 2);
      return value;
    }
    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (!value) throw new Error('--config requires a file path');
      argv.splice(index, 1);
      return value;
    }
  }
  return null;
}

async function resolveProvider({ config, requested, io }) {
  if (requested === 'native') return 'native';

  if (requested) {
    const provider = findProvider(config, requested);
    if (!provider) throw new Error(`Unknown provider: ${requested}`);
    return provider;
  }

  if (config.providers.length === 0) return 'native';

  if (!io.stdin.isTTY || !io.stdout.isTTY) return 'native';

  io.stdout.write('\nSelect Copilot provider:\n');
  config.providers.forEach((provider, index) => io.stdout.write(`  ${index + 1}) ${provider.name}\n`));
  io.stdout.write(`  ${config.providers.length + 1}) GitHub Copilot native\n\n`);

  const rl = readline.createInterface({ input: io.stdin, output: io.stdout });
  try {
    while (true) {
      const answer = await rl.question(`Provider (1-${config.providers.length + 1}) [default: 1 ${config.providers[0].name}]: `);
      if (!answer.trim()) return config.providers[0];

      const selected = parseMenuSelection(answer);
      if (Number.isInteger(selected) && selected >= 1 && selected <= config.providers.length) return config.providers[selected - 1];
      if (selected === config.providers.length + 1) return 'native';

      const provider = findProvider(config, answer.trim());
      if (provider) return provider;
      if (answer.trim().toLowerCase() === 'native') return 'native';

      io.stderr.write(`Invalid provider: ${answer}\n`);
    }
  } finally {
    rl.close();
  }
}

async function loadProviderModels(provider, io, { strict = false } = {}) {
  if (!provider.modelsUrl) return provider.defaultModel ? [provider.defaultModel] : [];

  const timeoutMs = provider.modelsTimeoutMs || DEFAULT_MODEL_FETCH_TIMEOUT_MS;
  try {
    const response = await fetch(provider.modelsUrl, {
      headers: providerModelHeaders(provider),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await readJsonResponse(response, MAX_MODEL_CATALOG_BYTES);
    const ranked = rankModels({
      payload,
      requireToolSupport: provider.requireToolSupport === true,
      modelIncludePrefixes: provider.modelIncludePrefixes,
      modelExcludePrefixes: provider.modelExcludePrefixes,
    });
    if (provider.defaultModel) {
      const defaultIndex = ranked.indexOf(provider.defaultModel);
      if (defaultIndex >= 0) ranked.splice(defaultIndex, 1);
      ranked.unshift(provider.defaultModel);
    }
    if (strict && ranked.length === 0) throw new Error(`No models returned by ${provider.modelsUrl}`);
    return ranked;
  } catch (error) {
    const errorName = error instanceof Error ? error.name : '';
    const errorMessage = error instanceof Error ? error.message : String(error);
    const detail = errorName === 'TimeoutError'
      ? `request timed out after ${timeoutMs}ms`
      : errorMessage;
    if (strict) throw new Error(`Could not load ${provider.name} models: ${detail}`, { cause: error });
    io.stderr.write(`Warning: could not refresh ${provider.name} models: ${detail}\n`);
    return provider.defaultModel ? [provider.defaultModel] : [];
  }
}

function providerModelHeaders(provider) {
  const headers = { ...(provider.modelsHeaders || {}) };
  if (provider.modelsAuth === false || provider.modelsAuth === 'none') return headers;
  const authMode = provider.modelsAuth === true || provider.modelsAuth == null
    ? 'bearer'
    : provider.modelsAuth;
  const token = authMode === 'bearer'
    ? provider.bearerToken || provider.apiKey
    : provider.apiKey || provider.bearerToken;
  if (!token) return headers;

  const sameOrigin = new URL(provider.modelsUrl).origin === new URL(provider.baseUrl).origin;
  const explicitAuth = provider.modelsAuth === true || typeof provider.modelsAuth === 'string';
  if (!sameOrigin && !explicitAuth) return headers;

  if (authMode === 'x-api-key') headers['x-api-key'] = token;
  else if (authMode === 'api-key') headers['api-key'] = token;
  else headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readJsonResponse(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`model catalog exceeds the ${maxBytes}-byte limit`);
  }

  if (!response.body?.getReader) return response.json();

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`model catalog exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const contents = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    contents.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(contents));
}

async function selectModel({ provider, models, noPrompt, io }) {
  const defaultModel = models[0] || provider.defaultModel;
  if (!defaultModel) throw new Error(`No model available for ${provider.name}. Pass --model or configure defaultModel.`);

  if (noPrompt || !io.stdin.isTTY || !io.stdout.isTTY) return defaultModel;

  io.stdout.write(`\nAvailable ${provider.name} models:\n\n`);
  models.forEach((model, index) => io.stdout.write(`  ${String(index + 1).padStart(3)}) ${model}\n`));
  io.stdout.write('\n');

  const rl = readline.createInterface({ input: io.stdin, output: io.stdout });
  try {
    while (true) {
      const answer = await rl.question(`Select model (1-${models.length}) [default: 1 ${defaultModel}]: `);
      if (!answer.trim()) return defaultModel;

      const selected = parseMenuSelection(answer);
      if (Number.isInteger(selected) && selected >= 1 && selected <= models.length) return models[selected - 1];
      io.stderr.write(`Invalid model: ${answer}\n`);
    }
  } finally {
    rl.close();
  }
}

function runCopilot({ copilotArgs, env, io, dryRun, provider, wireModel, native = false, config = null }) {
  const copilotBin = resolveCopilotBin({ env: io.env });

  if (dryRun) {
    io.stdout.write(`${JSON.stringify({
      command: copilotBin,
      native,
      provider: provider?.name,
      wireModel,
      env: redactEnv(env),
      args: copilotArgs,
    }, null, 2)}\n`);
    return 0;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(copilotBin, copilotArgs, {
      ...buildCopilotSpawnOptions({ env, ioEnv: io.env, config }),
      stdio: 'inherit',
    });

    child.on('error', (error) => reject(describeSpawnError(error, copilotBin)));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function describeSpawnError(error, copilotBin) {
  if (error?.code !== 'ENOENT') return error;

  return new Error(
    `Could not launch GitHub Copilot CLI at "${copilotBin}". Install it with "npm install -g @github/copilot" or set COPILOT_BIN to the executable path.`,
    { cause: error }
  );
}

async function readPackageVersion() {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  return manifest.version;
}

async function loadConfigForSanitization(options) {
  try {
    return await loadConfig(options);
  } catch {
    return null;
  }
}

export function buildCopilotSpawnOptions({ env, ioEnv = process.env, config = null }) {
  return {
    env: sanitizeCopilotEnvironment(ioEnv, env, collectProviderSecretEnvNames(config)),
    shell: false,
  };
}

function parseMenuSelection(value) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const selected = Number(trimmed);
  return Number.isSafeInteger(selected) ? selected : null;
}

function collectProviderSecretEnvNames(config) {
  return (config?.providers || []).flatMap((provider) => [
    ...asArray(provider.apiKeyEnv),
    ...asArray(provider.bearerTokenEnv),
  ]);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function redactEnv(env) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key,
    /KEY|TOKEN|SECRET|PASSWORD/i.test(key) ? '<redacted>' : value,
  ]));
}

function helpText() {
  return `copilot-byok - your own provider models inside the GitHub Copilot CLI /model picker

Usage:
  copilot-byok [options] [-- Copilot args...]

By default it starts a local router: Copilot launches as usual, authenticated with
GitHub, and /model lists the GitHub models together with your providers'.

Options:
      --list-providers      List providers and which ones are usable already
      --native              Start Copilot without the router, GitHub models only
  -m, --model <id>          Starting model (picker id, e.g. byok-openai-gpt-5-5)
  -c, --config <path>       Provider configuration file
      --upstream <url>      Force the Copilot API tier (individual/business/enterprise)
      --dry-run             Print what would start, then exit
  -h, --help                Show this help
  -v, --version             Print the copilot-byok version

Credentials:
  copilot-byok keys list            Show where each provider's key comes from
  copilot-byok keys set <provider>  Store a key (prompted, never echoed)
  copilot-byok keys remove <id>     Delete a stored key
  copilot-byok keys path            Print the key store location

In-session command:
  copilot-byok extension install    Add /byok to Copilot (needs --experimental)
  copilot-byok extension status
  copilot-byok extension uninstall

Classic mode (one provider per session, without the GitHub models):
      --legacy              Use the COPILOT_PROVIDER_* variables
  -P, --provider <id>       Provider to use
      --list-models         List the provider's models
      --no-model-prompt     Skip the interactive model choice
      --offline             Prevent Copilot from contacting GitHub
      --wire-api <api>      completions or responses

Examples:
  copilot-byok                                   # picker with GitHub + BYOK models
  copilot-byok --list-providers
  copilot-byok keys set anthropic
  copilot-byok -- -p "fix the bug"               # arguments go to Copilot
  copilot-byok --legacy --provider chutes --no-model-prompt
  copilot-byok --native --model claude-sonnet-4.6
`;
}
