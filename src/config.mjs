import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_PROVIDERS = [
  {
    id: 'chutes',
    name: 'Chutes',
    type: 'openai',
    baseUrl: 'https://llm.chutes.ai/v1',
    apiKeyEnv: ['CHUTES_API_KEY', 'COPILOT_CHUTES_API_KEY'],
    modelsUrl: 'https://llm.chutes.ai/v1/models',
    catalogModelId: 'gpt-4.1',
    requireToolSupport: true,
  },
  {
    id: 'opencode-go',
    aliases: ['go', 'opencode'],
    name: 'OpenCode Go',
    type: 'anthropic',
    baseUrl: 'https://opencode.ai/zen/go',
    apiKeyEnv: ['OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY', 'CLAUDE_GO_API_KEY'],
    modelsUrl: 'https://opencode.ai/zen/go/v1/models',
    catalogModelId: 'claude-sonnet-4.6',
    requireToolSupport: false,
  },
  {
    id: 'fireworks',
    aliases: ['fire', 'fireworks-ai'],
    name: 'Fireworks AI',
    type: 'anthropic',
    baseUrl: 'https://api.fireworks.ai/inference',
    apiKeyEnv: ['FIREWORKS_API_KEY', 'FIREWORKS_KEY', 'CLAUDE_FIRE_API_KEY'],
    modelsUrl: 'https://api.fireworks.ai/v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=200',
    catalogModelId: 'claude-sonnet-4.6',
    requireToolSupport: true,
  },
  {
    id: 'deepseek',
    aliases: ['deepseek-ai'],
    name: 'DeepSeek AI',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: ['DEEPSEEK_API_KEY', 'COPILOT_DEEPSEEK_API_KEY'],
    modelsUrl: 'https://api.deepseek.com/models',
    catalogModelId: 'gpt-4.1',
    defaultModel: 'deepseek-v4-pro',
  },
  {
    id: 'zai',
    aliases: ['z-ai', 'glm'],
    name: 'Z.ai',
    type: 'openai',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    apiKeyEnv: ['ZAI_API_KEY', 'Z_AI_API_KEY', 'GLM_API_KEY', 'COPILOT_ZAI_API_KEY'],
    modelsUrl: 'https://api.z.ai/api/coding/paas/v4/models',
    catalogModelId: 'gpt-4.1',
    defaultModel: 'glm-4.7',
  },
  {
    id: 'minimax',
    aliases: ['minimax-ai'],
    name: 'MiniMax',
    type: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    apiKeyEnv: ['MINIMAX_API_KEY', 'COPILOT_MINIMAX_API_KEY'],
    modelsUrl: 'https://api.minimax.io/v1/models',
    catalogModelId: 'gpt-4.1',
    defaultModel: 'MiniMax-M2.7',
  },
];

export async function loadConfig({ configPath, env = process.env } = {}) {
  const explicitPath = configPath || env.COPILOT_BYOK_CONFIG;
  if (explicitPath) return loadConfigFromPath(explicitPath, env);

  const defaultPath = defaultConfigPath(env);
  if (await fileExists(defaultPath)) return loadConfigFromPath(defaultPath, env);

  return normalizeConfig({ providers: DEFAULT_PROVIDERS }, env);
}

export async function loadConfigFromPath(configPath, env = process.env) {
  const contents = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(contents);
  return normalizeConfig(parsed, env);
}

export function findProvider(config, requested) {
  if (!requested) return null;
  const normalized = requested.toLowerCase();
  return config.providers.find((provider) => {
    const ids = [provider.id, provider.name, ...(provider.aliases || [])]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return ids.includes(normalized);
  }) || null;
}

function normalizeConfig(config, env) {
  const providers = (config.providers || []).map((provider) => ({
    ...normalizeProvider(provider, env),
  }));

  return { ...config, providers };
}

function normalizeProvider(provider, env) {
  if (provider.apiKey) {
    throw new Error(`Inline apiKey is not allowed for provider ${provider.name || provider.id}. Use apiKeyEnv instead.`);
  }

  if (provider.bearerToken) {
    throw new Error(`Inline bearerToken is not allowed for provider ${provider.name || provider.id}. Use bearerTokenEnv instead.`);
  }

  rejectSecretModelHeaders(provider);

  return {
    ...provider,
    id: provider.id || slug(provider.name),
    apiKey: readFirstEnv(env, provider.apiKeyEnv),
    bearerToken: readFirstEnv(env, provider.bearerTokenEnv),
  };
}

function rejectSecretModelHeaders(provider) {
  const headers = provider.modelsHeaders || {};
  for (const [name, value] of Object.entries(headers)) {
    const combined = `${name}: ${value}`;
    if (/authorization|api[-_]?key|token|secret|bearer/i.test(combined)) {
      throw new Error(`Secret model headers are not allowed for provider ${provider.name || provider.id}. Use apiKeyEnv or bearerTokenEnv instead.`);
    }
  }
}

function readFirstEnv(env, names) {
  const candidates = Array.isArray(names) ? names : names ? [names] : [];
  for (const name of candidates) {
    if (typeof env[name] === 'string' && env[name].trim()) return env[name].trim();
  }
  return null;
}

function defaultConfigPath(env) {
  if (process.platform === 'win32' && env.APPDATA) {
    return join(env.APPDATA, 'copilot-byok-switcher', 'providers.json');
  }

  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'copilot-byok-switcher', 'providers.json');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function slug(value) {
  return String(value || 'provider')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
