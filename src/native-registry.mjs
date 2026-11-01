// Builds the registry the Copilot CLI reads from providers.json.
//
// The native registry is a supported surface: models listed there appear in the
// /model picker next to the GitHub ones, and the CLI talks to each provider
// itself, without a local router. This module only translates the project's
// resolved providers into that shape; reading and writing the file lives in
// registry-file.mjs and the launch flow in cli.mjs.

import { DEFAULT_EFFORT_LEVELS, splitBudget } from './catalog.mjs';

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

/** The id the CLI accepts for `--model`: PROVIDER-NAME/MODEL-ID. */
export function nativeSelectionId(providerId, modelName) {
  return `${providerId}/${modelName}`;
}

/**
 * @param {object[]} providers  Active providers (models + credential resolved).
 * @returns {{providers: object[], models: object[]}}
 */
export function buildNativeRegistry(providers) {
  const nativeProviders = [];
  const nativeModels = [];

  for (const provider of providers) {
    nativeProviders.push(buildNativeProvider(provider));
    for (const model of provider.models || []) {
      nativeModels.push(buildNativeModel(provider, model));
    }
  }

  return { providers: nativeProviders, models: nativeModels };
}

/** Maps a native selection id back to the provider and model it describes. */
export function nativeSelectionMap(providers) {
  const map = new Map();
  for (const provider of providers) {
    for (const model of provider.models || []) {
      map.set(nativeSelectionId(provider.id, model.model), { provider, model });
    }
  }
  return map;
}

function buildNativeProvider(provider) {
  return {
    name: provider.id,
    type: provider.type ?? 'openai',
    baseUrl: provider.baseUrl,
    ...(provider.bearerToken
      ? { bearerToken: provider.bearerToken }
      : provider.apiKey
        ? { apiKey: provider.apiKey }
        : {}),
    ...(provider.wireApi ? { wireApi: provider.wireApi } : {}),
    ...(provider.transport ? { transport: provider.transport } : {}),
    ...(provider.azureApiVersion ? { azure: { apiVersion: provider.azureApiVersion } } : {}),
    ...(provider.headers && Object.keys(provider.headers).length > 0
      ? { headers: { ...provider.headers } }
      : {}),
  };
}

function buildNativeModel(provider, model) {
  const context = model.contextWindow || DEFAULT_CONTEXT_WINDOW;
  const output = model.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;
  const { promptBudget, outputBudget } = splitBudget(context, output);
  const picker = model.reasoningEffortPicker ?? provider.reasoningEffortPicker;
  const reasoningLevels = picker === false ? null : (model.reasoningEffortLevels || DEFAULT_EFFORT_LEVELS);

  return {
    id: model.model,
    provider: provider.id,
    name: model.label || `${model.model} (${provider.name})`,
    maxContextWindowTokens: context,
    maxPromptTokens: promptBudget,
    maxOutputTokens: outputBudget,
    capabilities: {
      supports: {
        toolCalls: true,
        streaming: true,
        ...(model.vision ? { vision: true } : {}),
        ...(model.reasoning && reasoningLevels ? { reasoning_effort: reasoningLevels } : {}),
      },
      limits: {
        max_context_window_tokens: context,
        max_prompt_tokens: promptBudget,
        max_output_tokens: outputBudget,
      },
    },
  };
}
