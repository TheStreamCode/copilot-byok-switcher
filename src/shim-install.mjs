// `copilot-byok shim install|uninstall|status`
//
// Makes plain `copilot` start the router, in every shell rather than only in one
// whose profile was edited. A small executable named `copilot` is placed in a
// directory the user puts first on PATH; it hands the real CLI's path to the
// launcher through COPILOT_BIN, which is what stops it calling itself.

import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

import { resolveCopilotBin } from './copilot-bin.mjs';

export function shimDir(env = process.env) {
  if (env.COPILOT_BYOK_SHIM_DIR) return env.COPILOT_BYOK_SHIM_DIR;

  if (platform() === 'win32' && env.APPDATA) {
    return join(env.APPDATA, 'copilot-byok', 'bin');
  }

  const base = env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(base, 'copilot-byok', 'bin');
}

export async function runShimCommand({ argv, io }) {
  const [action = 'status'] = argv;

  switch (action) {
    case 'install': return install(io);
    case 'uninstall': return uninstall(io);
    case 'status': return status(io);
    default:
      io.stderr.write(`Unknown shim action: ${action}. Use install, uninstall or status.\n`);
      return 1;
  }
}

async function install(io) {
  const dir = shimDir(io.env);
  const real = resolveCopilotBin({ env: io.env });

  await mkdir(dir, { recursive: true });
  const written = [];

  // POSIX shells and Git Bash on Windows both use the extension-less script.
  const shPath = join(dir, 'copilot');
  await writeFile(shPath, [
    '#!/bin/sh',
    '# Installed by `copilot-byok shim install`.',
    '# COPILOT_BIN points the launcher at the real CLI; without it the launcher',
    '# would find this shim on PATH and call itself.',
    `[ -n "$COPILOT_BIN" ] || COPILOT_BIN=${quoteSh(real)}`,
    'export COPILOT_BIN',
    'exec copilot-byok "$@"',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o755 });
  await chmod(shPath, 0o755).catch(() => {});
  written.push(shPath);

  if (platform() === 'win32') {
    const cmdPath = join(dir, 'copilot.cmd');
    await writeFile(cmdPath, [
      '@echo off',
      'REM Installed by `copilot-byok shim install`.',
      'REM COPILOT_BIN points the launcher at the real CLI; without it the launcher',
      'REM would find this shim on PATH and call itself.',
      `if "%COPILOT_BIN%"=="" set "COPILOT_BIN=${real}"`,
      'copilot-byok.cmd %*',
      '',
    ].join('\r\n'), 'utf8');
    written.push(cmdPath);
  }

  io.stdout.write(`Installed:\n${written.map((path) => `  ${path}`).join('\n')}\n\n`);
  io.stdout.write(`Real Copilot CLI: ${real}\n\n`);
  io.stdout.write(`Put this directory first on PATH:\n\n${pathInstructions(dir)}\n`);
  io.stdout.write('\nAfter that, `copilot` starts the router in any shell. Remove it with\n');
  io.stdout.write('`copilot-byok shim uninstall` and by undoing the PATH change.\n');
  return 0;
}

async function uninstall(io) {
  const dir = shimDir(io.env);
  await rm(join(dir, 'copilot'), { force: true });
  await rm(join(dir, 'copilot.cmd'), { force: true });

  // Leave the directory only if the user put something else there.
  const remaining = await readdir(dir).catch(() => []);
  if (remaining.length === 0) await rm(dir, { recursive: true, force: true });

  io.stdout.write(`Removed the shim from ${dir}\n`);
  io.stdout.write('Remember to take the directory off PATH if you added it.\n');
  return 0;
}

async function status(io) {
  const dir = shimDir(io.env);
  const entries = await readdir(dir).catch(() => []);
  const installed = entries.includes('copilot') || entries.includes('copilot.cmd');

  if (!installed) {
    io.stdout.write('The shim is not installed. Run: copilot-byok shim install\n');
    return 0;
  }

  io.stdout.write(`Shim installed in ${dir}\n`);

  const onPath = (io.env.PATH || '').split(platform() === 'win32' ? ';' : ':')
    .some((entry) => entry && entry.replace(/[\\/]+$/, '').toLowerCase() === dir.toLowerCase());
  io.stdout.write(onPath
    ? 'The directory is on PATH: `copilot` uses it.\n'
    : `The directory is NOT on PATH yet:\n\n${pathInstructions(dir)}\n`);
  return 0;
}

function pathInstructions(dir) {
  if (platform() === 'win32') {
    return [
      '  PowerShell (permanent, current user):',
      `    [Environment]::SetEnvironmentVariable('Path', '${dir};' + [Environment]::GetEnvironmentVariable('Path','User'), 'User')`,
    ].join('\n');
  }

  return [
    '  bash:  echo \'export PATH="' + dir + ':$PATH"\' >> ~/.bashrc',
    '  zsh:   echo \'export PATH="' + dir + ':$PATH"\' >> ~/.zshrc',
    '  fish:  fish_add_path ' + dir,
  ].join('\n');
}

function quoteSh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
