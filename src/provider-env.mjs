export function buildProviderEnvironment({ provider, wireModel }) {
  if (!provider?.type) throw new Error('Provider type is required');
  if (!provider?.baseUrl) throw new Error('Provider baseUrl is required');
  if (!wireModel) throw new Error('Provider wire model is required');

  const env = {
    COPILOT_PROVIDER_TYPE: provider.type,
    COPILOT_PROVIDER_BASE_URL: provider.baseUrl,
    COPILOT_PROVIDER_MODEL_ID: provider.catalogModelId || wireModel,
    COPILOT_PROVIDER_WIRE_MODEL: wireModel,
  };

  if (provider.apiKey) {
    env.COPILOT_PROVIDER_API_KEY = provider.apiKey;
  }

  if (provider.bearerToken) {
    env.COPILOT_PROVIDER_BEARER_TOKEN = provider.bearerToken;
  }

  if (provider.wireApi) {
    env.COPILOT_PROVIDER_WIRE_API = provider.wireApi;
  }

  if (provider.maxPromptTokens != null) {
    env.COPILOT_PROVIDER_MAX_PROMPT_TOKENS = String(provider.maxPromptTokens);
  }

  if (provider.maxOutputTokens != null) {
    env.COPILOT_PROVIDER_MAX_OUTPUT_TOKENS = String(provider.maxOutputTokens);
  }

  return env;
}
