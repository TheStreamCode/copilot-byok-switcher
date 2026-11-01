// `copilot-byok models` - print what the configured providers currently serve.
//
// Router mode discovers models at startup, but there was no way to inspect them
// without opening a session: --list-models only exists in legacy mode and only
// covers one provider. This command reuses the same discovery path.

import { extractConfigPath } from './argv-config.mjs';
import { findProvider, loadConfig } from './config.mjs';
import { resolveLiveModels, resolveOfflineModels } from './launcher.mjs';
import { loadKeys } from './keystore.mjs';

export async function runModelsCommand({ argv = [], io }) {
  const args = { json: false, offline: false, help: false, configPath: null, filter: null };
  const rest = [...argv];
  args.configPath = extractConfigPath(rest);

  for (const arg of rest) {
    if (arg === '--json') args.json = true;
    else if (arg === '--offline') args.offline = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown models option: ${arg}`);
    else if (args.filter) throw new Error(`Only one provider can be selected, got "${args.filter}" and "${arg}"`);
    else args.filter = arg;
  }

  if (args.help) {
    io.stdout.write(modelsHelpText());
    return 0;
  }

  const config = await loadConfig({
    configPath: args.configPath,
    env: io.env,
    secrets: await loadKeys(io.env),
  });

  const requested = args.filter ? findProvider(config, args.filter) : null;
  if (args.filter && !requested) {
    throw new Error(`Unknown provider: ${args.filter}. Run "copilot-byok --list-providers" to see them all.`);
  }

  const providers = args.offline
    ? await resolveOfflineModels(config.providers, { env: io.env })
    : await resolveLiveModels(config.providers, { env: io.env });

  const rows = providers
    .filter((provider) => !requested || provider.id === requested.id)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: (provider.models || []).map((model) => ({
        id: model.model,
        label: model.label || null,
        contextWindow: model.contextWindow || null,
        vision: Boolean(model.vision),
        reasoning: Boolean(model.reasoning),
      })),
    }));

  if (args.json) {
    io.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }

  for (const row of rows) {
    io.stdout.write(`${row.id}  (${row.models.length} models${args.offline ? ', offline lists' : ''})\n`);
    for (const model of row.models) {
      const details = [
        model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k context` : null,
        model.vision ? 'vision' : null,
        model.reasoning ? 'reasoning' : null,
      ].filter(Boolean).join(', ');
      io.stdout.write(`  ${model.id}${details ? `  (${details})` : ''}\n`);
    }
  }

  return 0;
}

function modelsHelpText() {
  return `copilot-byok models - list the models each provider currently serves

Usage:
  copilot-byok models [provider] [--json] [--offline] [--config <path>]

Options:
      --json           Machine-readable output
      --offline        Skip discovery; use pinned or remembered lists
  -c, --config <path>  Provider configuration file
  -h, --help           Show this help
`;
}
