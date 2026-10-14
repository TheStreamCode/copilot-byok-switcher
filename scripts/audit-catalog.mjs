#!/usr/bin/env node
// Checks that every catalog provider serves a usable model list.
//
//   npm run catalog:audit
//
// Discovery shows whatever the provider returns, so a provider whose catalog is
// reachable but yields no usable chat model is a problem worth failing on.
// Providers with a public catalog are checked without credentials; the rest use
// whatever key is configured, and are reported as unverifiable when there is
// none. Unreachable providers are reported but do not fail the audit: the cause
// is usually the network, not the catalog.

import { readFile } from 'node:fs/promises';

import { loadKeys } from '../src/keystore.mjs';
import { rankModels } from '../src/model-ranking.mjs';

const CATALOG_URL = new URL('../src/providers.default.json', import.meta.url);
const TIMEOUT_MS = 20_000;

const catalog = JSON.parse(await readFile(CATALOG_URL, 'utf8'));
const stored = await loadKeys(process.env);

const rows = await Promise.all(catalog.providers.map((provider) => audit(provider, stored)));

let bad = 0;
for (const row of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const flag = row.problem ? '!!' : '  ';
  process.stdout.write(`${flag} ${row.id.padEnd(20)} ${row.verdict}\n`);
  if (row.problem) {
    bad += 1;
    process.stdout.write(`     ${row.problem}\n`);
  }
}

process.stdout.write(bad === 0
  ? '\nEvery reachable provider serves at least one usable chat model.\n'
  : `\n${bad} provider(s) need attention (see above).\n`);

process.exitCode = bad === 0 ? 0 : 1;

async function audit(provider, keys) {
  const key = (provider.apiKeyEnv || []).map((name) => process.env[name]).find(Boolean) || keys[provider.id];

  try {
    const response = await fetch(provider.modelsUrl, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        id: provider.id,
        verdict: key
          ? `unverifiable (${response.status} with a configured key)`
          : `unverifiable (${response.status}, no key configured)`,
      };
    }

    const body = await response.json();
    const items = body?.data || body?.models || (Array.isArray(body) ? body : []);
    const usable = rankModels({ payload: body });
    if (usable.length === 0) {
      return {
        id: provider.id,
        verdict: `${items.length} served, 0 usable`,
        problem: 'reachable but yields no usable chat model: check the endpoint or the ranking filters',
      };
    }
    return { id: provider.id, verdict: `${items.length} served, ${usable.length} usable` };
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'timeout' : (error.cause?.code || error.message);
    return { id: provider.id, verdict: `unreachable (${reason})` };
  }
}
