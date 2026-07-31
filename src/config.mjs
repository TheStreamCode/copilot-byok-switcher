import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PROVIDER_TYPES = new Set(['openai', 'anthropic', 'azure']);
const WIRE_APIS = new Set(['completions', 'responses']);

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
    id: 'openrouter',
    aliases: ['or'],
    name: 'OpenRouter',
    type: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: ['OPENROUTER_API_KEY', 'COPILOT_OPENROUTER_API_KEY'],
    modelsUrl: 'https://openrouter.ai/api/v1/models?supported_parameters=tools&output_modalities=text',
    catalogModelId: 'gpt-4.1',
    defaultModel: 'openrouter/auto',
    requireToolSupport: true,
  },
  {
    id: 'moonshot',
    aliases: ['kimi', 'moonshot-ai', 'kimi-ai'],
    name: 'Moonshot AI (Kimi)',
    type: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    apiKeyEnv: ['MOONSHOT_API_KEY', 'KIMI_API_KEY', 'COPILOT_MOONSHOT_API_KEY'],
    modelsUrl: 'https://api.moonshot.ai/v1/models',
    catalogModelId: 'gpt-4.1',
    defaultModel: 'kimi-k3',
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
    defaultModel: 'glm-5.1',
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
  {
    id: 'alibaba-token-plan',
    aliases: ['alibaba', 'qwen', 'bailian', 'dashscope', 'modelstudio'],
    name: 'Alibaba Model Studio Token Plan',
    type: 'openai',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: [
      'ALIBABA_TOKEN_PLAN_API_KEY',
      'DASHSCOPE_TOKEN_PLAN_API_KEY',
      'BAILIAN_TOKEN_PLAN_API_KEY',
    ],
    catalogModelId: 'gpt-4.1',
    defaultModel: 'qwen3.7-plus',
    requireToolSupport: true,
  },
  {
    id: 'tencent-token-plan',
    aliases: ['tencent', 'tokenhub', 'tencent-tokenhub'],
    name: 'Tencent Cloud Token Plan',
    type: 'openai',
    baseUrl: 'https://api.lkeap.cloud.tencent.com/plan/v3',
    apiKeyEnv: ['TENCENT_TOKEN_PLAN_API_KEY', 'TOKENHUB_TOKEN_PLAN_API_KEY'],
    catalogModelId: 'gpt-4.1',
    defaultModel: 'tc-code-latest',
    requireToolSupport: true,
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
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in provider config ${configPath}: ${error.message}`, { cause: error });
  }

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
  if (!isRecord(config) || !Array.isArray(config.providers)) {
    throw new Error('Provider config must be an object with a providers array');
  }

  const providers = config.providers.map((provider, index) => normalizeProvider(provider, env, index));
  assertUniqueProviderNames(providers);

  return { ...config, providers };
}

function normalizeProvider(provider, env, index) {
  if (!isRecord(provider)) {
    throw new Error(`Provider at index ${index} must be an object`);
  }

  const name = requiredString(provider.name, `Provider at index ${index} requires a name`);
  const id = provider.id == null ? slug(name) : requiredString(provider.id, `Provider ${name} requires an id`);
  if (!PROVIDER_ID_PATTERN.test(id)) {
    throw new Error(`Provider id "${id}" may contain only letters, numbers, dots, underscores, and hyphens`);
  }

  const type = requiredString(provider.type, `Provider ${name} requires a type`).toLowerCase();
  if (!PROVIDER_TYPES.has(type)) {
    throw new Error(`Provider ${name} has unsupported type "${provider.type}"`);
  }

  const aliases = normalizeAliases(provider.aliases, name);
  const baseUrl = validateHttpUrl(provider.baseUrl, `Provider ${name} baseUrl`);
  const modelsUrl = provider.modelsUrl == null
    ? undefined
    : validateHttpUrl(provider.modelsUrl, `Provider ${name} modelsUrl`);
  const apiKeyEnv = normalizeEnvNames(provider.apiKeyEnv, name, 'apiKeyEnv');
  const bearerTokenEnv = normalizeEnvNames(provider.bearerTokenEnv, name, 'bearerTokenEnv');
  const wireApi = provider.wireApi == null
    ? undefined
    : requiredString(provider.wireApi, `Provider ${name} wireApi must be a non-empty string`).toLowerCase();

  if (provider.apiKey) {
    throw new Error(`Inline apiKey is not allowed for provider ${name}. Use apiKeyEnv instead.`);
  }

  if (provider.bearerToken) {
    throw new Error(`Inline bearerToken is not allowed for provider ${name}. Use bearerTokenEnv instead.`);
  }

  validateProviderOptions(provider, name, type);
  rejectSecretModelHeaders(provider, name);

  return {
    ...provider,
    id,
    name,
    type,
    baseUrl,
    ...(modelsUrl ? { modelsUrl } : {}),
    ...(aliases ? { aliases } : {}),
    ...(apiKeyEnv ? { apiKeyEnv } : {}),
    ...(bearerTokenEnv ? { bearerTokenEnv } : {}),
    ...(wireApi ? { wireApi } : {}),
    apiKey: readFirstEnv(env, apiKeyEnv),
    bearerToken: readFirstEnv(env, bearerTokenEnv),
  };
}

function validateProviderOptions(provider, name, type) {
  for (const field of ['catalogModelId', 'defaultModel']) {
    if (provider[field] != null) requiredString(provider[field], `Provider ${name} ${field} must be a non-empty string`);
  }

  if (provider.wireApi != null) {
    const wireApi = requiredString(provider.wireApi, `Provider ${name} wireApi must be a non-empty string`).toLowerCase();
    if (!WIRE_APIS.has(wireApi)) {
      throw new Error(`Provider ${name} wireApi must be "completions" or "responses"`);
    }
    if (type === 'anthropic') {
      throw new Error(`Provider ${name} cannot set wireApi for the Anthropic protocol`);
    }
  }

  for (const field of ['maxPromptTokens', 'maxOutputTokens']) {
    if (provider[field] != null && (!Number.isInteger(provider[field]) || provider[field] <= 0)) {
      throw new Error(`Provider ${name} ${field} must be a positive integer`);
    }
  }

  if (provider.modelsTimeoutMs != null && (
    !Number.isInteger(provider.modelsTimeoutMs) ||
    provider.modelsTimeoutMs < 10 ||
    provider.modelsTimeoutMs > 300_000
  )) {
    throw new Error(`Provider ${name} modelsTimeoutMs must be an integer between 10 and 300000`);
  }

  if (provider.requireToolSupport != null && typeof provider.requireToolSupport !== 'boolean') {
    throw new Error(`Provider ${name} requireToolSupport must be a boolean`);
  }

  if (provider.modelsAuth != null && ![true, false, 'none'].includes(provider.modelsAuth)) {
    throw new Error(`Provider ${name} modelsAuth must be true, false, or "none"`);
  }

  if (provider.modelsHeaders != null) {
    if (!isRecord(provider.modelsHeaders)) {
      throw new Error(`Provider ${name} modelsHeaders must be an object`);
    }

    for (const [headerName, value] of Object.entries(provider.modelsHeaders)) {
      if (!headerName.trim() || typeof value !== 'string') {
        throw new Error(`Provider ${name} modelsHeaders must contain string header values`);
      }
    }
  }
}

function rejectSecretModelHeaders(provider, name) {
  const headers = provider.modelsHeaders || {};
  for (const [headerName, value] of Object.entries(headers)) {
    const combined = `${headerName}: ${value}`;
    if (/authorization|api[-_]?key|token|secret|bearer/i.test(combined)) {
      throw new Error(`Secret model headers are not allowed for provider ${name}. Use apiKeyEnv or bearerTokenEnv instead.`);
    }
  }
}

function normalizeAliases(value, name) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error(`Provider ${name} aliases must be an array`);

  const aliases = value.map((alias) => requiredString(alias, `Provider ${name} aliases must be non-empty strings`));
  for (const alias of aliases) {
    if (!PROVIDER_ID_PATTERN.test(alias)) {
      throw new Error(`Provider alias "${alias}" may contain only letters, numbers, dots, underscores, and hyphens`);
    }
  }

  return [...new Set(aliases)];
}

function normalizeEnvNames(value, providerName, field) {
  if (value == null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) throw new Error(`Provider ${providerName} ${field} cannot be empty`);

  const normalized = values.map((name) => requiredString(
    name,
    `Provider ${providerName} ${field} must contain environment variable names`
  ));
  for (const name of normalized) {
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new Error(`Provider ${providerName} ${field} contains invalid environment variable name "${name}"`);
    }
  }

  return Array.isArray(value) ? [...new Set(normalized)] : normalized[0];
}

function assertUniqueProviderNames(providers) {
  const claimed = new Map();
  for (const provider of providers) {
    for (const value of [provider.id, provider.name, ...(provider.aliases || [])]) {
      const normalized = value.toLowerCase();
      if (normalized === 'native') {
        throw new Error(`Provider ${provider.name} cannot use reserved name "native"`);
      }

      const existing = claimed.get(normalized);
      if (existing && existing !== provider) {
        throw new Error(`Provider identifier "${value}" is used by both ${existing.name} and ${provider.name}`);
      }
      claimed.set(normalized, provider);
    }
  }
}

function validateHttpUrl(value, label) {
  const input = requiredString(value, `${label} is required`);
  let url;
  try {
    url = new URL(input);
  } catch (error) {
    throw new Error(`${label} must be an absolute URL`, { cause: error });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain embedded credentials`);
  }

  return url.href.replace(/\/$/, '');
}

function requiredString(value, message) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
