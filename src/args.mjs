export function parseArgs(argv) {
  const result = {
    providerName: null,
    explicitModel: null,
    configPath: null,
    listModels: false,
    noModelPrompt: false,
    offline: false,
    wireApi: null,
    dryRun: false,
    help: false,
    copilotArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      result.copilotArgs.push(...argv.slice(index + 1));
      break;
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }

    if (arg === '--native') {
      result.providerName = 'native';
      continue;
    }

    if (arg === '--provider' || arg === '-P') {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a provider id`);
      result.providerName = requireOptionValue(argv[index], arg, 'a provider id');
      continue;
    }

    if (arg.startsWith('--provider=')) {
      result.providerName = requireOptionValue(arg.slice('--provider='.length), '--provider', 'a provider id');
      continue;
    }

    if (arg === '--model' || arg === '-m') {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a model id`);
      result.explicitModel = requireOptionValue(argv[index], arg, 'a model id');
      continue;
    }

    if (arg.startsWith('--model=')) {
      result.explicitModel = requireOptionValue(arg.slice('--model='.length), '--model', 'a model id');
      continue;
    }

    if (arg === '--config' || arg === '-c') {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a file path`);
      result.configPath = requireOptionValue(argv[index], arg, 'a file path');
      continue;
    }

    if (arg.startsWith('--config=')) {
      result.configPath = requireOptionValue(arg.slice('--config='.length), '--config', 'a file path');
      continue;
    }

    if (arg === '--list-models') {
      result.listModels = true;
      continue;
    }

    if (arg === '--no-model-prompt') {
      result.noModelPrompt = true;
      continue;
    }

    if (arg === '--offline') {
      result.offline = true;
      continue;
    }

    if (arg === '--wire-api') {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires completions or responses`);
      result.wireApi = requireWireApi(argv[index], arg);
      continue;
    }

    if (arg.startsWith('--wire-api=')) {
      result.wireApi = requireWireApi(arg.slice('--wire-api='.length), '--wire-api');
      continue;
    }

    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    result.copilotArgs.push(arg);
  }

  if (result.listModels && result.providerName === 'native') {
    throw new Error('--list-models requires a BYOK provider');
  }

  if (result.listModels && result.explicitModel) {
    throw new Error('--list-models cannot be combined with --model');
  }

  if (result.providerName === 'native' && (result.offline || result.wireApi)) {
    throw new Error('--offline and --wire-api require a BYOK provider');
  }

  return result;
}

function requireWireApi(value, option) {
  const normalized = requireOptionValue(value, option, 'completions or responses').toLowerCase();
  if (!['completions', 'responses'].includes(normalized)) {
    throw new Error(`${option} must be completions or responses`);
  }
  return normalized;
}

function requireOptionValue(value, option, expected) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${option} requires ${expected}`);
  }

  return value.trim();
}
