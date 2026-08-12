// Starts the router on an ephemeral loopback port and launches Copilot CLI pointed at
// it through COPILOT_API_URL. The router shuts down when Copilot exits.

import spawn from 'cross-spawn';

import { buildCatalog } from './catalog.mjs';
import { createRouter } from './router.mjs';
import { createUpstreamResolver } from './upstream.mjs';
import { resolveCopilotBin } from './copilot-bin.mjs';
import { sanitizeCopilotEnvironment } from './process-env.mjs';

/** Usable providers: they have models and a credential (or need none). */
export function selectActiveProviders(providers) {
  return providers.filter((provider) => {
    if (provider.enabled === false) return false;
    if (!provider.models?.length) return false;
    if (provider.authRequired === false) return true;
    return Boolean(provider.apiKey || provider.bearerToken);
  });
}

export function startRouter({ providers, upstreamOrigin, onEvent, port = 0, host = '127.0.0.1' }) {
  const active = selectActiveProviders(providers);
  const catalog = buildCatalog(active.map((provider) => ({
    ...provider,
    apiKey: provider.bearerToken || provider.apiKey,
  })));

  const upstream = createUpstreamResolver({ explicit: upstreamOrigin });
  const server = createRouter({ catalog, upstream, onEvent });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        catalog,
        providers: active,
        url: `http://${host}:${address.port}`,
        close: () => new Promise((done) => {
          // Copilot keeps connections alive: without closing them explicitly the
          // process would never terminate.
          server.closeAllConnections();
          server.close(done);
        }),
      });
    });
  });
}

export function runCopilotWithRouter({ routerUrl, copilotArgs, env, config, io }) {
  const copilotBin = resolveCopilotBin({ env: io.env });
  const childEnv = sanitizeCopilotEnvironment(
    io.env,
    { ...env, COPILOT_API_URL: routerUrl },
    collectSecretEnvNames(config)
  );

  return new Promise((resolve, reject) => {
    const child = spawn(copilotBin, copilotArgs, { env: childEnv, shell: false, stdio: 'inherit' });
    child.on('error', (error) => reject(describeSpawnError(error, copilotBin)));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function collectSecretEnvNames(config) {
  return (config?.providers || []).flatMap((provider) => [
    ...toArray(provider.apiKeyEnv),
    ...toArray(provider.bearerTokenEnv),
  ]);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function describeSpawnError(error, copilotBin) {
  if (error?.code !== 'ENOENT') return error;
  return new Error(
    `Could not launch GitHub Copilot CLI at "${copilotBin}". Install it with "npm install -g @github/copilot" or set COPILOT_BIN.`,
    { cause: error }
  );
}
