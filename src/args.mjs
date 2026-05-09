export function parseArgs(argv) {
  const result = {
    providerName: null,
    explicitModel: null,
    configPath: null,
    listModels: false,
    noModelPrompt: false,
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
      result.providerName = argv[index];
      continue;
    }

    if (arg.startsWith('--provider=')) {
      result.providerName = arg.slice('--provider='.length);
      continue;
    }

    if (arg === '--model' || arg === '-m') {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a model id`);
      result.explicitModel = argv[index];
      continue;
    }

    if (arg.startsWith('--model=')) {
      result.explicitModel = arg.slice('--model='.length);
      continue;
    }

    if (arg === '--config' || arg === '-c') {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a file path`);
      result.configPath = argv[index];
      continue;
    }

    if (arg.startsWith('--config=')) {
      result.configPath = arg.slice('--config='.length);
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

    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    result.copilotArgs.push(arg);
  }

  return result;
}
