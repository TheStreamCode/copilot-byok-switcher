#!/usr/bin/env node
// Rebuilds src/providers.default.json from scripts/catalog-sources.json.
//
//   node scripts/update-catalog.mjs
//
// The shipped catalog carries provider endpoints only: model lists always come
// from live discovery, so there is nothing here that can go stale. The only
// derivation is modelsUrl, the conventional OpenAI list endpoint under baseUrl.

import { readFile, writeFile } from 'node:fs/promises';

const SOURCES_URL = new URL('./catalog-sources.json', import.meta.url);
const OUTPUT_URL = new URL('../src/providers.default.json', import.meta.url);

const sources = JSON.parse(await readFile(SOURCES_URL, 'utf8'));

const providers = [];
for (const source of sources.providers) {
  if (!source.id || !source.name || !source.baseUrl) {
    throw new Error(`Provider entry needs id, name and baseUrl: ${JSON.stringify(source)}`);
  }

  providers.push({
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    // Standard OpenAI endpoint: used by discovery, --list-models and legacy mode.
    modelsUrl: source.modelsUrl || `${source.baseUrl.replace(/\/$/, '')}/models`,
    ...(source.apiKeyEnv ? { apiKeyEnv: source.apiKeyEnv } : {}),
    ...(source.authRequired === false ? { authRequired: false } : {}),
    ...(source.enabled === false ? { enabled: false } : {}),
    ...(source.note ? { note: source.note } : {}),
  });
}

const ids = providers.map((provider) => provider.id);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicates.length > 0) {
  throw new Error(`Duplicate provider ids: ${duplicates.join(', ')}`);
}

const output = {
  $schema: '../schemas/providers.schema.json',
  _generated: 'npm run catalog:update — do not edit by hand',
  providers,
};

await writeFile(OUTPUT_URL, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${providers.length} providers (endpoints only, no shipped models).\n`);
