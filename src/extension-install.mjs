// `copilot-byok extension install|uninstall|status`
//
// Copies extensions/byok/extension.mjs into ~/.copilot/extensions/byok/, rewriting
// the package root so the extension can import this package's config and key store.

import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(PACKAGE_ROOT, 'extensions', 'byok', 'extension.mjs');

export function extensionDir(env = process.env) {
  const home = env.COPILOT_HOME || join(homedir(), '.copilot');
  return join(home, 'extensions', 'byok');
}

export async function runExtensionCommand({ argv, io }) {
  const [action = 'status'] = argv;

  switch (action) {
    case 'install': return install(io);
    case 'uninstall': return uninstall(io);
    case 'status': return status(io);
    default:
      io.stderr.write(`Unknown extension action: ${action}. Use install, uninstall or status.\n`);
      return 1;
  }
}

async function install(io) {
  const target = join(extensionDir(io.env), 'extension.mjs');
  const template = await readFile(SOURCE, 'utf8');

  // The extension runs as its own process: it needs an absolute path to import from.
  const contents = template.replace(
    "const PACKAGE_ROOT = '__PACKAGE_ROOT__';",
    `const PACKAGE_ROOT = ${JSON.stringify(pathToFileURL(PACKAGE_ROOT).href)};`
  );

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, 'utf8');

  io.stdout.write(`Installed /byok to ${target}\n\n`);
  io.stdout.write('Extensions are gated behind the experimental flag, so start Copilot with:\n');
  io.stdout.write('  copilot-byok -- --experimental\n');
  io.stdout.write('or turn it on once inside a session with: /settings experimental on\n\n');
  io.stdout.write('Then run /byok to add a provider key without leaving the session.\n');
  return 0;
}

async function uninstall(io) {
  const dir = extensionDir(io.env);
  await rm(dir, { recursive: true, force: true });
  io.stdout.write(`Removed ${dir}\n`);
  return 0;
}

async function status(io) {
  const target = join(extensionDir(io.env), 'extension.mjs');
  try {
    await access(target);
    io.stdout.write(`/byok is installed at ${target}\n`);
    io.stdout.write('Start Copilot with --experimental for extensions to load.\n');
  } catch {
    io.stdout.write('/byok is not installed. Run: copilot-byok extension install\n');
  }
  return 0;
}
