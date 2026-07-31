import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const VSCODE_COPILOT_SHIM_PATTERN = /[\\/]globalStorage[\\/]github\.copilot-chat[\\/]copilotCli[\\/]/i;

export function resolveCopilotBin({ env = process.env, platform = process.platform } = {}) {
  if (typeof env.COPILOT_BIN === 'string' && env.COPILOT_BIN.trim()) {
    return env.COPILOT_BIN.trim();
  }

  const pathValue = readEnvironmentValue(env, 'PATH');
  if (!pathValue) return 'copilot';

  const commandNames = platform === 'win32'
    ? ['copilot.cmd', 'copilot.exe', 'copilot.bat', 'copilot']
    : ['copilot'];
  const pathDelimiter = platform === 'win32' ? ';' : delimiter;
  const candidates = [];

  for (const rawDirectory of pathValue.split(pathDelimiter)) {
    const directory = rawDirectory.trim().replace(/^"|"$/g, '');
    if (!directory) continue;

    for (const commandName of commandNames) {
      const candidate = join(directory, commandName);
      if (isRunnable(candidate, platform)) {
        candidates.push(candidate);
        break;
      }
    }
  }

  return candidates.find((candidate) => !VSCODE_COPILOT_SHIM_PATTERN.test(candidate))
    || candidates[0]
    || 'copilot';
}

function readEnvironmentValue(env, requestedName) {
  const match = Object.entries(env).find(([name]) => name.toUpperCase() === requestedName);
  return typeof match?.[1] === 'string' ? match[1] : '';
}

function isRunnable(path, platform) {
  try {
    accessSync(path, platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
