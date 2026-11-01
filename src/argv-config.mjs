/** Removes --config/-c from subcommand arguments and returns its value. */
export function extractConfigPath(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' || arg === '-c') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires a file path`);
      argv.splice(index, 2);
      return value;
    }
    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (!value) throw new Error('--config requires a file path');
      argv.splice(index, 1);
      return value;
    }
  }
  return null;
}
