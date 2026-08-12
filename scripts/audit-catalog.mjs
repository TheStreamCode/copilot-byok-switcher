#!/usr/bin/env node
// Checks that every curated model still exists on its provider.
//
//   npm run catalog:audit
//
// The curated lists are only a fallback, but a wrong entry is worse than a missing
// one: it offers a model the user's plan does not include, and the failure only
// shows up when they pick it. Providers with a public catalog are checked without
// credentials; the rest use whatever key is configured, and are reported as
// unverifiable when there is none.

import { readFile } from 'node:fs/promises';

import { loadKeys } from '../src/keystore.mjs';

const CATALOG_URL = new URL('../src/providers.default.json', import.meta.url);
const TIMEOUT_MS = 20_000;

const catalog = JSON.parse(await readFile(CATALOG_URL, 'utf8'));
const stored = await loadKeys(process.env);

const rows = await Promise.all(catalog.providers.map((provider) => audit(provider, stored)));

let wrong = 0;
for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const flag = row.missing?.length ? '!!' : '  ';
  process.stdout.write(`${flag} ${row.id.padEnd(20)} ${String(row.curated).padStart(2)} curated  ${row.verdict}\n`);
  if (row.missing?.length) {
    wrong += 1;
    process.stdout.write(`     not served by the provider: ${row.missing.join(', ')}\n`);
  }
}

process.stdout.write(wrong === 0
  ? '\nEvery curated model that could be checked exists on its provider.\n'
  : `\n${wrong} provider(s) list models that do not exist. Remove them from scripts/catalog-sources.json and re-run npm run catalog:update.\n`);

process.exitCode = wrong === 0 ? 0 : 1;

async function audit(provider, keys) {
  const curated = (provider.models || []).map((model) => model.model);
  if (curated.length === 0) return { id: provider.id, curated: 0, verdict: 'no curated models' };

  const key = (provider.apiKeyEnv || []).map((name) => process.env[name]).find(Boolean) || keys[provider.id];

  try {
    const response = await fetch(provider.modelsUrl, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        id: provider.id,
        curated: curated.length,
        verdict: `unverifiable (${response.status}${key ? '' : ', no key configured'})`,
      };
    }

    const body = await response.json();
    const items = body?.data || body?.models || (Array.isArray(body) ? body : []);
    const live = new Set(items.map((item) => (typeof item === 'string' ? item : item?.id)));
    const missing = curated.filter((model) => !live.has(model));

    return {
      id: provider.id,
      curated: curated.length,
      missing,
      verdict: missing.length === 0 ? `all present (${live.size} served)` : `${missing.length} do not exist`,
    };
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'timeout' : (error.cause?.code || error.message);
    return { id: provider.id, curated: curated.length, verdict: `unreachable (${reason})` };
  }
}
