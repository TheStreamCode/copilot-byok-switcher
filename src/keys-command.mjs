// `copilot-byok keys ...` — manage the optional local key store.

import readline from 'node:readline/promises';
import { Writable } from 'node:stream';

import { findProvider } from './config.mjs';
import { keystorePath, loadKeys, removeKey, restrictPermissions, saveKey } from './keystore.mjs';

export async function runKeysCommand({ argv, config, io }) {
  const [action = 'list', target] = argv;

  switch (action) {
    case 'list': return listKeys({ config, io });
    case 'set': return setKey({ target, config, io });
    case 'remove':
    case 'rm': return deleteKey({ target, config, io });
    case 'path':
      io.stdout.write(`${keystorePath(io.env)}\n`);
      return 0;
    default:
      io.stderr.write(`Unknown keys action: ${action}. Use list, set, remove or path.\n`);
      return 1;
  }
}

async function listKeys({ config, io }) {
  const stored = await loadKeys(io.env);

  for (const provider of config.providers) {
    if (provider.authRequired === false) continue;

    const envName = (provider.apiKeyEnv || []).find((name) => io.env[name]);
    const source = envName ? `environment (${envName})`
      : stored[provider.id] ? 'key store'
        : `not set -> ${(provider.apiKeyEnv || [])[0] || 'n/a'}`;

    io.stdout.write(`${provider.id.padEnd(22)} ${source}\n`);
  }

  io.stdout.write(`\nKey store: ${keystorePath(io.env)}\n`);
  io.stdout.write('Environment variables take precedence over stored keys.\n');
  return 0;
}

async function setKey({ target, config, io }) {
  const provider = requireProvider({ target, config, io });
  if (!provider) return 1;

  if (!io.stdin.isTTY) {
    io.stderr.write('Setting a key requires an interactive terminal, so it is never taken from arguments or pipes.\n');
    return 1;
  }

  const key = await promptHidden(`API key for ${provider.name}: `, io);
  if (!key) {
    io.stderr.write('No key entered, nothing changed.\n');
    return 1;
  }

  await saveKey(provider.id, key, io.env);
  const path = keystorePath(io.env);
  const restricted = await restrictPermissions(path);

  io.stdout.write(`Saved to ${path}\n`);
  if (!restricted) {
    io.stderr.write('Warning: could not restrict file permissions. Check that only your account can read it.\n');
  }
  return 0;
}

async function deleteKey({ target, config, io }) {
  const provider = requireProvider({ target, config, io });
  if (!provider) return 1;

  const removed = await removeKey(provider.id, io.env);
  io.stdout.write(removed ? `Removed the stored key for ${provider.name}\n` : `No stored key for ${provider.name}\n`);
  return 0;
}

function requireProvider({ target, config, io }) {
  if (!target) {
    io.stderr.write('Specify a provider id, for example: copilot-byok keys set openai\n');
    return null;
  }

  const provider = findProvider(config, target);
  if (!provider) {
    io.stderr.write(`Unknown provider: ${target}. Run "copilot-byok --list-providers" to see them all.\n`);
    return null;
  }
  return provider;
}

/** Reads a line without echoing it, so the key never appears on screen or in scrollback. */
async function promptHidden(question, io) {
  let muted = false;

  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) io.stdout.write(chunk, encoding);
      callback();
    },
  });

  const rl = readline.createInterface({ input: io.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = true;

  try {
    const value = await answer;
    return value.trim();
  } finally {
    muted = false;
    rl.close();
    io.stdout.write('\n');
  }
}
