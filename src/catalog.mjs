// Turns configured providers into the entries Copilot CLI expects from GET /models.
//
// The shape mirrors GitHub's own model entries: if one declares capabilities the model
// does not have (tool calling, streaming), the harness fails mid-session.

const ID_PREFIX = 'byok';

/**
 * @param {object[]} providers   Already-resolved providers (with apiKey where needed).
 * @returns {{entries: object[], routes: Map<string, {provider: object, model: object}>}}
 */
export function buildCatalog(providers) {
  const entries = [];
  const routes = new Map();

  for (const provider of providers) {
    for (const model of provider.models || []) {
      const id = buildModelId(provider.id, model.model);
      if (routes.has(id)) continue;

      routes.set(id, { provider, model });
      entries.push(buildEntry({ id, provider, model }));
    }
  }

  return { entries, routes };
}

/** Stable id without "/": the CLI also uses it as a key in its own settings. */
export function buildModelId(providerId, modelName) {
  const slug = `${providerId}-${modelName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${ID_PREFIX}-${slug}`;
}

export function isByokModelId(value) {
  return typeof value === 'string' && value.startsWith(`${ID_PREFIX}-`);
}

function buildEntry({ id, provider, model }) {
  const context = model.contextWindow || 128_000;
  const output = model.maxOutputTokens || 32_000;

  return {
    id,
    name: model.label || `${model.model} (${provider.name})`,
    object: 'model',
    vendor: provider.name,
    version: id,
    preview: false,
    is_chat_default: false,
    is_chat_fallback: false,
    model_picker_enabled: true,
    model_picker_category: pickCategory(context),
    model_picker_price_category: 'low',
    supported_endpoints: ['/chat/completions'],
    capabilities: {
      family: id,
      object: 'model_capabilities',
      type: 'chat',
      tokenizer: 'o200k_base',
      limits: {
        max_context_window_tokens: context,
        max_prompt_tokens: Math.max(context - output, Math.floor(context * 0.75)),
        max_output_tokens: output,
        max_non_streaming_output_tokens: Math.min(output, 16_000),
      },
      supports: {
        streaming: true,
        tool_calls: true,
        parallel_tool_calls: true,
        structured_outputs: true,
        ...(model.vision ? { vision: true } : {}),
      },
    },
  };
}

function pickCategory(context) {
  if (context >= 500_000) return 'powerful';
  if (context >= 200_000) return 'versatile';
  return 'lightweight';
}
