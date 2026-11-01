export function buildProviderEnvironment({ provider, wireModel, offline = false }) {
  if (!provider?.type) throw new Error('Provider type is required');
  if (!provider?.baseUrl) throw new Error('Provider baseUrl is required');
  if (!wireModel) throw new Error('Provider wire model is required');

  const env = {
    COPILOT_MODEL: provider.catalogModelId || wireModel,
    COPILOT_PROVIDER_TYPE: provider.type,
    COPILOT_PROVIDER_BASE_URL: provider.baseUrl,
    COPILOT_PROVIDER_WIRE_MODEL: wireModel,
  };

  if (provider.catalogModelId) {
    env.COPILOT_PROVIDER_MODEL_ID = provider.catalogModelId;
  }

  // The CLI reads this as newline-separated "Name: Value" pairs. Custom
  // `headers` are already validated against credential-bearing names.
  if (provider.headers && Object.keys(provider.headers).length > 0) {
    env.COPILOT_PROVIDER_HEADERS = Object.entries(provider.headers)
      .map(([headerName, value]) => `${headerName}: ${value}`)
      .join('\n');
  }

  // A rotating credential: the CLI runs the command itself, so it takes
  // precedence over a static key and is never resolved by this process.
  if (provider.apiKeyCommand) {
    env.COPILOT_PROVIDER_API_KEY_COMMAND = provider.apiKeyCommand;
  }

  if (provider.bearerToken) {
    env.COPILOT_PROVIDER_BEARER_TOKEN = provider.bearerToken;
  } else if (provider.apiKey) {
    env.COPILOT_PROVIDER_API_KEY = provider.apiKey;
  }

  if (provider.wireApi) {
    env.COPILOT_PROVIDER_WIRE_API = provider.wireApi;
  }

  if (provider.transport) {
    env.COPILOT_PROVIDER_TRANSPORT = provider.transport;
  }

  if (provider.azureApiVersion) {
    env.COPILOT_PROVIDER_AZURE_API_VERSION = provider.azureApiVersion;
  }

  if (provider.maxPromptTokens != null) {
    env.COPILOT_PROVIDER_MAX_PROMPT_TOKENS = String(provider.maxPromptTokens);
  }

  if (provider.maxOutputTokens != null) {
    env.COPILOT_PROVIDER_MAX_OUTPUT_TOKENS = String(provider.maxOutputTokens);
  }

  if (offline) {
    env.COPILOT_OFFLINE = 'true';
  }

  return env;
}
