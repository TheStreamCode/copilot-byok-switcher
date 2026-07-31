import readline from 'node:readline/promises';

import spawn from 'cross-spawn';

import { parseArgs } from './args.mjs';
import { resolveCopilotBin } from './copilot-bin.mjs';
import { findProvider, loadConfig } from './config.mjs';
import { rankModels } from './model-ranking.mjs';
import { buildProviderEnvironment } from './provider-env.mjs';
import { sanitizeCopilotEnvironment } from './process-env.mjs';

const DEFAULT_MODEL_FETCH_TIMEOUT_MS = 10_000;

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const args = parseArgs(argv);

  if (args.help) {
    io.stdout.write(helpText());
    return 0;
  }

  if (args.providerName === 'native') {
    const copilotArgs = [...args.copilotArgs];
    if (args.explicitModel) copilotArgs.unshift('--model', args.explicitModel);
    return runCopilot({ copilotArgs, env: {}, io, dryRun: args.dryRun, native: true });
  }

  const config = await loadConfig({ configPath: args.configPath, env: io.env });
  const provider = await resolveProvider({ config, requested: args.providerName, io });

  if (provider === 'native') {
    if (args.offline || args.wireApi) {
      throw new Error('--offline and --wire-api require a BYOK provider');
    }
    const copilotArgs = [...args.copilotArgs];
    if (args.explicitModel) copilotArgs.unshift('--model', args.explicitModel);
    return runCopilot({ copilotArgs, env: {}, io, dryRun: args.dryRun, native: true });
  }

  if (!args.listModels && !provider.apiKey && !provider.bearerToken) {
    throw new Error(`Missing API key for ${provider.name}. Set one of: ${formatEnvNames(provider.apiKeyEnv || provider.bearerTokenEnv)}`);
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
    const payload = await response.json();
    const ranked = rankModels({ payload, requireToolSupport: provider.requireToolSupport === true });
    if (provider.defaultModel && !ranked.includes(provider.defaultModel)) ranked.push(provider.defaultModel);
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
  const token = provider.bearerToken || provider.apiKey;
  if (!token) return headers;

  const sameOrigin = new URL(provider.modelsUrl).origin === new URL(provider.baseUrl).origin;
  if (sameOrigin || provider.modelsAuth === true) headers.Authorization = `Bearer ${token}`;
  return headers;
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
      ...buildCopilotSpawnOptions({ env, ioEnv: io.env, platform: process.platform, config }),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
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

function formatEnvNames(names) {
  const values = Array.isArray(names) ? names : names ? [names] : [];
  return values.join(', ') || 'provider apiKeyEnv';
}

function helpText() {
  return `copilot-byok - switch GitHub Copilot CLI between native and BYOK providers\n\nUsage:\n  copilot-byok [options] [-- Copilot args...]\n\nOptions:\n  -P, --provider <id>       Provider id or alias\n      --native              Run GitHub Copilot CLI without BYOK\n  -m, --model <model>       Provider wire model for BYOK, native model for --native\n  -c, --config <path>       Provider config JSON path\n      --list-models         Print ranked models for the selected provider\n      --no-model-prompt     Use automatic default model\n      --offline             Prevent Copilot from contacting GitHub in BYOK mode\n      --wire-api <api>      BYOK wire API: completions or responses\n      --dry-run             Print command/env without launching Copilot\n  -h, --help                Show this help\n\nExamples:\n  copilot-byok --provider chutes --no-model-prompt\n  copilot-byok --provider openrouter --offline --no-model-prompt\n  copilot-byok --provider alibaba-token-plan --wire-api responses --no-model-prompt\n  copilot-byok --provider fireworks --model accounts/fireworks/models/minimax-m2p5 -p "fix the bug"\n  copilot-byok --native --model claude-sonnet-4.6\n`;
}
