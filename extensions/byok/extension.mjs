// /byok — manage BYOK providers from inside a Copilot CLI session.
//
// Installed with `copilot-byok extension install`, which copies this file to
// ~/.copilot/extensions/byok/ and rewrites PACKAGE_ROOT to the absolute path of
// the installed package, so the extension can reuse its config and key store.
//
// Requires Copilot CLI started with --experimental (or `experimental: true` in
// settings): extensions are gated behind that flag.

import { approveAll } from '@github/copilot-sdk';
import { joinSession } from '@github/copilot-sdk/extension';

const PACKAGE_ROOT = '__PACKAGE_ROOT__';

const { loadConfig, findProvider } = await import(`${PACKAGE_ROOT}/src/config.mjs`);
const { loadKeys, saveKey, removeKey, keystorePath } = await import(`${PACKAGE_ROOT}/src/keystore.mjs`);

const session = await joinSession({
  onPermissionRequest: approveAll,
  tools: [],
  hooks: {},
  commands: [
    {
      name: 'byok',
      description: 'Add or remove API keys for your BYOK model providers',
      handler: async (context) => {
        const action = (context.args || '').trim().toLowerCase();
        try {
          if (action === 'list') return await listProviders();
          if (action === 'remove') return await removeProvider();
          return await addProvider();
        } catch (error) {
          await session.log(`/byok failed: ${error.message}`);
        }
      },
    },
  ],
});

// The launcher strips provider credentials from this process, so the ids of the
// providers configured through the environment arrive separately.
const ENV_PROVIDERS = new Set((process.env.COPILOT_BYOK_ENV_PROVIDERS || '').split(',').filter(Boolean));

async function currentState() {
  const secrets = await loadKeys(process.env);
  const config = await loadConfig({ env: process.env, secrets });
  return { config, secrets };
}

/** Providers worth offering: they publish models and need a credential. */
function configurable(config) {
  return config.providers.filter((provider) => provider.authRequired !== false && provider.models?.length);
}

function describe(provider, secrets) {
  if (ENV_PROVIDERS.has(provider.id)) return `${provider.name} — set via environment`;
  if (secrets[provider.id]) return `${provider.name} — key stored`;
  return `${provider.name} — not configured (${provider.models.length} models)`;
}

async function addProvider() {
  const { config, secrets } = await currentState();
  const providers = configurable(config);

  // Unconfigured ones first: that is what the command is usually opened for.
  const configured = (provider) => Number(ENV_PROVIDERS.has(provider.id) || Boolean(secrets[provider.id]));
  providers.sort((a, b) => configured(a) - configured(b));

  const labels = providers.map((provider) => describe(provider, secrets));
  const choice = await session.ui.select('Choose a provider to configure:', labels);
  if (!choice) return;

  const provider = providers[labels.indexOf(choice)];
  if (!provider) return;

  if (ENV_PROVIDERS.has(provider.id)) {
    await session.log(
      `${provider.name} already takes its key from the environment. ` +
      'Environment variables win over stored keys: unset the variable to use a stored key instead.'
    );
    return;
  }

  const key = await session.ui.input(`Paste the API key for ${provider.name}:`);
  if (!key || !key.trim()) {
    await session.log('No key entered, nothing changed.');
    return;
  }

  await saveKey(provider.id, key.trim(), process.env);
  await session.log(
    `Saved the ${provider.name} key in ${keystorePath(process.env)}.\n` +
    `Its ${provider.models.length} models will be in /model the next time you start ` +
    'copilot-byok: Copilot caches the model list for the lifetime of a session, so ' +
    'neither reopening the picker nor /restart picks them up.'
  );
}

async function removeProvider() {
  const { config, secrets } = await currentState();
  const stored = Object.keys(secrets);

  if (stored.length === 0) {
    await session.log('No stored keys. Nothing to remove.');
    return;
  }

  const labels = stored.map((id) => findProvider(config, id)?.name || id);
  const choice = await session.ui.select('Remove the stored key for:', labels);
  if (!choice) return;

  const providerId = stored[labels.indexOf(choice)];
  await removeKey(providerId, process.env);
  await session.log(`Removed the stored key for ${choice}.`);
}

async function listProviders() {
  const { config, secrets } = await currentState();
  const lines = configurable(config).map((provider) => `  ${describe(provider, secrets)}`);
  await session.log(`BYOK providers:\n${lines.join('\n')}\n\nKey store: ${keystorePath(process.env)}`);
}

await session.log('/byok ready');
