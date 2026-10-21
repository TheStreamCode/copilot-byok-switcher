// Request headers for a provider's model-catalog endpoint.
//
// A provider credential is only attached when the catalog lives on the same
// origin as the provider API, or when `modelsAuth` opts in explicitly. A custom
// provider can ship any `modelsUrl`, so sending the key unconditionally would
// hand it to a third-party host. `headers` from the provider config are always
// preserved; authentication is scoped separately.
export function providerModelHeaders(provider) {
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
