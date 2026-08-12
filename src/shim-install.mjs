// `copilot-byok shim install|uninstall|status`
//
// Makes plain `copilot` start the router, in every shell rather than only in one
// whose profile was hand-edited.
//
// Two mechanisms, because one alone is not enough:
//
//   * a `copilot` executable in a per-user bin directory, for shells that simply
//     search PATH;
//   * a shell function in the user's profiles, which is required whenever another
//     `copilot` sits earlier in PATH — on Windows the system PATH is searched
//     before the user one, so an npm-installed CLI in a machine-wide directory
//     wins over anything the user can add. A function beats both.
//
// Either way the real CLI's path is handed to the launcher through COPILOT_BIN,
// which is what stops it resolving the shim and calling itself.

import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { homedir, platform } from 'node:os';

import { resolveCopilotBin } from './copilot-bin.mjs';

const BEGIN = '# >>> copilot-byok >>>';
const END = '# <<< copilot-byok <<<';

export function shimDir(env = process.env) {
  if (env.COPILOT_BYOK_SHIM_DIR) return env.COPILOT_BYOK_SHIM_DIR;

  if (platform() === 'win32' && env.APPDATA) {
    return join(env.APPDATA, 'copilot-byok', 'bin');
  }

  const base = env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(base, 'copilot-byok', 'bin');
}

/**
 * Directories on PATH that hold a `copilot` and come before ours. When this is
 * not empty, the executable shim can never win and a shell function is required.
 */
export function findShadowingEntries(dir, env = process.env, exists = defaultExists) {
  const entries = (env.PATH || '').split(delimiter).filter(Boolean);
  const ours = entries.findIndex((entry) => samePath(entry, dir));
  const before = ours === -1 ? entries : entries.slice(0, ours);

  return before.filter((entry) => ['copilot', 'copilot.cmd', 'copilot.ps1', 'copilot.exe']
    .some((name) => exists(join(entry, name))));
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

  await writeExecutables(dir, real);
  io.stdout.write(`Wrote the shim to ${dir}\n`);

  const shadowing = findShadowingEntries(dir, io.env);
  const profiles = await writeShellFunctions(io, real);

  if (profiles.length > 0) {
    io.stdout.write(`Added a copilot function to:\n${profiles.map((p) => `  ${p}`).join('\n')}\n`);
  }

  if (shadowing.length > 0) {
    io.stdout.write(
      `\nAnother copilot comes earlier on PATH (${shadowing[0]}), so the shim alone\n` +
      'cannot take precedence — on Windows the system PATH is always searched before\n' +
      'the user one. The shell function above is what makes it work.\n'
    );
  } else {
    io.stdout.write(`\nPut this directory first on PATH as well:\n\n${pathInstructions(dir)}\n`);
  }

  io.stdout.write('\nOpen a new terminal, then run: copilot-byok shim status\n');
  return 0;
}

async function uninstall(io) {
  const dir = shimDir(io.env);
  await rm(join(dir, 'copilot'), { force: true });
  await rm(join(dir, 'copilot.cmd'), { force: true });
  const remaining = await readdir(dir).catch(() => []);
  if (remaining.length === 0) await rm(dir, { recursive: true, force: true });

  const cleaned = [];
  for (const profile of profilePaths(io.env)) {
    if (await removeBlock(profile)) cleaned.push(profile);
  }

  io.stdout.write(`Removed the shim from ${dir}\n`);
  if (cleaned.length > 0) {
    io.stdout.write(`Removed the copilot function from:\n${cleaned.map((p) => `  ${p}`).join('\n')}\n`);
  }
  io.stdout.write('Take the directory off PATH if you added it there.\n');
  return 0;
}

async function status(io) {
  const dir = shimDir(io.env);
  const entries = await readdir(dir).catch(() => []);
  const hasShim = entries.includes('copilot') || entries.includes('copilot.cmd');

  const profiles = [];
  for (const profile of profilePaths(io.env)) {
    if (await hasBlock(profile)) profiles.push(profile);
  }

  if (!hasShim && profiles.length === 0) {
    io.stdout.write('Not installed. Run: copilot-byok shim install\n');
    return 0;
  }

  io.stdout.write(hasShim ? `Shim: ${dir}\n` : 'Shim: not written\n');
  io.stdout.write(profiles.length > 0
    ? `Shell function in:\n${profiles.map((p) => `  ${p}`).join('\n')}\n`
    : 'Shell function: not installed\n');

  const shadowing = findShadowingEntries(dir, io.env);
  const onPath = (io.env.PATH || '').split(delimiter).some((entry) => samePath(entry, dir));

  if (shadowing.length > 0) {
    io.stdout.write(`\nAnother copilot precedes ours on PATH (${shadowing[0]}).\n`);
    io.stdout.write(profiles.length > 0
      ? 'The shell function takes precedence over it, so `copilot` uses the router.\n'
      : 'Without the shell function, `copilot` will NOT use the router.\n');
  } else if (onPath) {
    io.stdout.write('\nThe shim directory is on PATH and nothing precedes it.\n');
  } else {
    io.stdout.write(`\nThe shim directory is not on PATH:\n\n${pathInstructions(dir)}\n`);
  }

  return 0;
}

async function writeExecutables(dir, real) {
  await mkdir(dir, { recursive: true });

  const shPath = join(dir, 'copilot');
  await writeFile(shPath, [
    '#!/bin/sh',
    '# Installed by `copilot-byok shim install`.',
    `[ -n "$COPILOT_BIN" ] || COPILOT_BIN=${quoteSh(real)}`,
    'export COPILOT_BIN',
    'exec copilot-byok "$@"',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o755 });
  await chmod(shPath, 0o755).catch(() => {});

  if (platform() === 'win32') {
    await writeFile(join(dir, 'copilot.cmd'), [
      '@echo off',
      'REM Installed by `copilot-byok shim install`.',
      `if "%COPILOT_BIN%"=="" set "COPILOT_BIN=${real}"`,
      'copilot-byok.cmd %*',
      '',
    ].join('\r\n'), 'utf8');
  }
}

function profilePaths(env = process.env) {
  const home = homedir();
  const paths = [];

  if (env.COPILOT_BYOK_PROFILE_DIR) {
    paths.push(join(env.COPILOT_BYOK_PROFILE_DIR, 'Microsoft.PowerShell_profile.ps1'));
    paths.push(join(env.COPILOT_BYOK_PROFILE_DIR, '.bashrc'));
    return paths;
  }

  if (platform() === 'win32') {
    const documents = join(home, 'Documents');
    paths.push(join(documents, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'));
    paths.push(join(documents, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'));
  } else {
    paths.push(join(home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1'));
  }

  paths.push(join(home, '.bashrc'), join(home, '.zshrc'));
  return paths;
}

async function writeShellFunctions(io, real) {
  const written = [];

  for (const profile of profilePaths(io.env)) {
    const isPowerShell = profile.endsWith('.ps1');
    // Only create a profile that already exists, or the PowerShell one on the
    // platform where it is the norm: writing a .bashrc onto a machine that has
    // none would be presumptuous.
    // Existing profiles are always updated. On Windows both PowerShell profiles
    // are created if missing — 5.1 and 7 read different files, and the user may
    // open either — while a .bashrc is never conjured onto a machine without one.
    const exists = await readFile(profile, 'utf8').then(() => true).catch(() => false);
    if (!exists && !(isPowerShell && platform() === 'win32')) continue;

    const body = isPowerShell ? powerShellFunction(real) : posixFunction(real);
    await upsertBlock(profile, body);
    written.push(profile);
  }

  return written;
}

function powerShellFunction(real) {
  return [
    '# `copilot` goes through copilot-byok, so your BYOK models appear in /model.',
    '# A function is used because it takes precedence over PATH, which a shim in a',
    '# user directory cannot when another copilot sits in the system PATH.',
    'function copilot {',
    `    if (-not $env:COPILOT_BIN) { $env:COPILOT_BIN = '${real}' }`,
    '    copilot-byok @args',
    '}',
    '',
    'function copilot-vanilla {',
    `    & '${real}' @args`,
    '}',
  ].join('\n');
}

function posixFunction(real) {
  return [
    '# `copilot` goes through copilot-byok, so your BYOK models appear in /model.',
    'copilot() {',
    `  [ -n "$COPILOT_BIN" ] || COPILOT_BIN=${quoteSh(real)}`,
    '  export COPILOT_BIN',
    '  command copilot-byok "$@"',
    '}',
    '',
    'copilot-vanilla() {',
    `  command ${quoteSh(real)} "$@"`,
    '}',
  ].join('\n');
}

async function upsertBlock(path, body) {
  const block = `${BEGIN}\n${body}\n${END}\n`;
  const current = await readFile(path, 'utf8').catch(() => '');
  const without = stripBlock(current);
  const separator = without && !without.endsWith('\n') ? '\n' : '';

  await mkdir(join(path, '..'), { recursive: true }).catch(() => {});
  await writeFile(path, `${without}${separator}${block}`, 'utf8');
}

async function removeBlock(path) {
  const current = await readFile(path, 'utf8').catch(() => null);
  if (current === null || !current.includes(BEGIN)) return false;

  await writeFile(path, stripBlock(current), 'utf8');
  return true;
}

async function hasBlock(path) {
  const current = await readFile(path, 'utf8').catch(() => '');
  return current.includes(BEGIN);
}

function stripBlock(contents) {
  const start = contents.indexOf(BEGIN);
  if (start === -1) return contents;
  const end = contents.indexOf(END, start);
  if (end === -1) return contents.slice(0, start);
  return contents.slice(0, start) + contents.slice(end + END.length).replace(/^\n/, '');
}

function pathInstructions(dir) {
  if (platform() === 'win32') {
    return [
      '  PowerShell (permanent, current user):',
      `    [Environment]::SetEnvironmentVariable('Path', '${dir};' + [Environment]::GetEnvironmentVariable('Path','User'), 'User')`,
    ].join('\n');
  }

  return [
    `  bash:  echo 'export PATH="${dir}:$PATH"' >> ~/.bashrc`,
    `  zsh:   echo 'export PATH="${dir}:$PATH"' >> ~/.zshrc`,
    `  fish:  fish_add_path ${dir}`,
  ].join('\n');
}

function samePath(a, b) {
  const normalize = (value) => value.replace(/[\\/]+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}

function defaultExists(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function quoteSh(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
