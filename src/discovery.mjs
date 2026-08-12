// Asks each provider which models it currently serves, instead of trusting a
// hand-written list that goes stale the moment a provider ships something new.
//
// Every provider in the catalog exposes an OpenAI-style GET /models (verified at
// release time), and most return the metadata that matters with it: context
// window, output limit, and whether the model can call tools. What is missing is
// filled in from the shipped catalog, and a provider that cannot be reached falls
// back to it entirely — a network hiccup must never empty the picker.

import { rankModels } from './model-ranking.mjs';

// Providers are queried in parallel, so this is the worst-case startup delay, not
// a per-provider cost. Measured: the slower catalogs answer in about five seconds,
// and anything past this keeps its shipped list rather than holding up the session.
const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_LIMIT = 12;
const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
// A failure is remembered only briefly: a provider that was down or rate-limited
// for a moment should not stay excluded for the rest of a long session.
const FAILURE_CACHE_TTL_MS = 60 * 1000;

const sessionCache = new Map();

/** Exposed for tests and for anyone wanting a forced refresh. */
export function clearDiscoveryCache() {
  sessionCache.clear();
}

/**
 * @param {object} provider   Resolved provider, with apiKey when it needs one.
 * @param {object} [options]
 * @returns {Promise<{models: object[], source: 'provider'|'catalog', reason?: string}>}
 */
export async function discoverModels(provider, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  limit = provider.maxDiscoveredModels || DEFAULT_LIMIT,
  fetchImpl = fetch,
  cache = sessionCache,
  now = Date.now,
} = {}) {
  const curated = provider.models || [];

  if (provider.discover === false || !provider.modelsUrl) {
    return { models: curated, source: 'catalog', reason: 'discovery disabled' };
  }

  // The catalog is rebuilt whenever Copilot asks for the model list, which would
  // otherwise mean querying every provider again — and repeating the same failure
  // in the log each time. Model catalogs change on the order of days.
  const cacheKey = `${provider.id}:${provider.modelsUrl}`;
  const cached = cache?.get(cacheKey);
  if (cached) {
    const ttl = cached.result.source === 'provider' ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS;
    if (now() - cached.at < ttl) return cached.result;
  }

  try {
    const payload = await fetchCatalog(provider, { timeoutMs, fetchImpl });
    const ranked = rankModels({
      payload,
      requireToolSupport: false, // enforced below, where the raw entry is available
      modelIncludePrefixes: provider.modelIncludePrefixes,
      modelExcludePrefixes: provider.modelExcludePrefixes,
    });

    const raw = indexById(payload);
    const models = [];

    for (const id of ranked) {
      const entry = raw.get(id);
      const tools = declaresToolSupport(entry);

      // Only skip when the provider explicitly says the model cannot call tools.
      // Silence is not a denial: plenty of providers publish no capability field.
      if (tools === false) continue;

      models.push(mergeWithCurated(id, entry, curated, provider));
      if (models.length >= limit) break;
    }

    const result = models.length === 0
      ? { models: curated, source: 'catalog', reason: 'no usable models returned' }
      : { models, source: 'provider' };

    cache?.set(cacheKey, { at: now(), result });
    return result;
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : error.message;
    const result = { models: curated, source: 'catalog', reason };

    // Cache failures too: a provider that is down or rejecting the key would
    // otherwise be retried on every single model-list request.
    cache?.set(cacheKey, { at: now(), result });
    return result;
  }
}

async function fetchCatalog(provider, { timeoutMs, fetchImpl }) {
  const headers = { accept: 'application/json', ...(provider.headers || {}) };
  const token = provider.bearerToken || provider.apiKey;
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetchImpl(provider.modelsUrl, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > MAX_CATALOG_BYTES) {
    throw new Error(`model catalog exceeds ${MAX_CATALOG_BYTES} bytes`);
  }

  return response.json();
}

function indexById(payload) {
  const items = Array.isArray(payload) ? payload : (payload?.data || payload?.models || []);
  const byId = new Map();
  for (const item of items) {
    const id = typeof item === 'string' ? item : item?.id || item?.name;
    if (id) byId.set(id, typeof item === 'string' ? { id } : item);
  }
  return byId;
}

/**
 * @returns {boolean|undefined} true/false when the provider states it, undefined
 *   when it publishes no capability information at all.
 */
export function declaresToolSupport(entry) {
  if (!entry || typeof entry !== 'object') return undefined;

  // Chutes and friends: supported_features: ["tools", ...]
  // OpenRouter: supported_parameters: ["tools", ...]
  for (const field of ['supported_features', 'supported_parameters', 'features', 'capabilities']) {
    const value = entry[field];
    if (Array.isArray(value)) return value.some((item) => /^tools?(_call)?$/i.test(String(item)));
  }

  // Nested shapes: capabilities.supports.tool_calls, capabilities.tool_call
  const capabilities = entry.capabilities;
  if (capabilities && typeof capabilities === 'object') {
    const supports = capabilities.supports || capabilities;
    for (const field of ['tool_calls', 'tool_call', 'tools', 'function_calling']) {
      if (typeof supports[field] === 'boolean') return supports[field];
    }
  }

  return undefined;
}

/** Reads the context window under any of the names providers actually use. */
/**
 * Whether the model reasons before answering. Copilot only shows its effort
 * selector for models that say so, and only then does it forward the level.
 */
export function declaresReasoning(entry) {
  if (!entry || typeof entry !== 'object') return false;

  for (const field of ['supported_features', 'supported_parameters', 'features']) {
    const value = entry[field];
    if (Array.isArray(value)) {
      if (value.some((item) => /^(reasoning|include_reasoning|reasoning_effort|thinking)$/i.test(String(item)))) {
        return true;
      }
    }
  }

  if (entry.reasoning === true) return true;
  const supports = entry.capabilities?.supports || entry.capabilities;
  return Boolean(supports?.reasoning || supports?.reasoning_effort);
}

export function readContextWindow(entry) {
  return firstPositive(
    entry?.context_length,
    entry?.max_context_length,
    entry?.max_model_len,
    entry?.context_window,
    entry?.limit?.context,
    entry?.top_provider?.context_length
  );
}

export function readOutputLimit(entry) {
  return firstPositive(
    entry?.max_output_length,
    entry?.max_completion_tokens,
    entry?.max_output_tokens,
    entry?.limit?.output,
    entry?.top_provider?.max_completion_tokens
  );
}

function mergeWithCurated(id, entry, curated, provider) {
  const known = curated.find((model) => model.model === id);
  const context = readContextWindow(entry) || known?.contextWindow;
  const output = readOutputLimit(entry) || known?.maxOutputTokens;

  return {
    model: id,
    label: known?.label || `${entry?.name || prettifyId(id)} (${provider.name})`,
    ...(context ? { contextWindow: context } : {}),
    ...(output ? { maxOutputTokens: output } : {}),
    ...(declaresReasoning(entry) || known?.reasoning ? { reasoning: true } : {}),
  };
}

/**
 * Model ids are often namespaced (`Qwen/Qwen3.5-397B`, `accounts/fireworks/models/x`).
 * The picker already groups by vendor, so the namespace is noise there — the id
 * itself is untouched, only the label is shortened.
 */
function prettifyId(id) {
  const last = id.split('/').pop();
  return last || id;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.floor(number);
  }
  return undefined;
}
