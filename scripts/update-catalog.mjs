#!/usr/bin/env node
// Rebuilds src/providers.default.json by combining the curated selection in
// scripts/catalog-sources.json with the model metadata published on models.dev.
//
//   node scripts/update-catalog.mjs
//
// Context limits and capabilities come from the source rather than hand-written
// values: declaring capabilities a model lacks makes the Copilot harness fail.

import { readFile, writeFile } from 'node:fs/promises';

const SOURCES_URL = new URL('./catalog-sources.json', import.meta.url);
const OUTPUT_URL = new URL('../src/providers.default.json', import.meta.url);
const MODELS_DEV = 'https://models.dev/api.json';

const sources = JSON.parse(await readFile(SOURCES_URL, 'utf8'));

process.stdout.write(`Fetching ${MODELS_DEV}...
`);
const response = await fetch(MODELS_DEV, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`models.dev answered ${response.status}`);
const catalog = await response.json();

const warnings = [];
const providers = [];

for (const source of sources.providers) {
  const upstream = source.source ? catalog[source.source] : null;
  if (source.source && !upstream) {
    warnings.push(`provider "${source.source}" is not present on models.dev`);
  }

  const models = [];
  for (const modelId of source.models || []) {
    const meta = upstream?.models?.[modelId];
    if (!meta) {
      warnings.push(`${source.id}: model "${modelId}" not found on models.dev, using conservative values`);
    }
    if (meta && meta.tool_call === false) {
      warnings.push(`${source.id}: "${modelId}" does not support tool calling, skipped`);
      continue;
    }
    models.push(buildModel(modelId, meta, source));
  }

  providers.push({
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    // Standard OpenAI endpoint: used by `--list-models` and by the legacy mode.
    modelsUrl: `${source.baseUrl.replace(/\/$/, '')}/models`,
    ...(source.apiKeyEnv ? { apiKeyEnv: source.apiKeyEnv } : {}),
    ...(source.authRequired === false ? { authRequired: false } : {}),
    ...(source.enabled === false ? { enabled: false } : {}),
    ...(source.note ? { note: source.note } : {}),
    models,
  });
}

const output = {
  $schema: '../schemas/providers.schema.json',
  _generated: 'npm run catalog:update — do not edit by hand',
  providers,
};

await writeFile(OUTPUT_URL, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const modelCount = providers.reduce((total, p) => total + p.models.length, 0);
process.stdout.write(`
Wrote ${providers.length} providers and ${modelCount} models.
`);
if (warnings.length) {
  process.stdout.write(`
Warnings (${warnings.length}):
`);
  for (const warning of warnings) process.stdout.write(`  - ${warning}\n`);
}

function buildModel(modelId, meta, source) {
  const limit = meta?.limit || {};
  const context = limit.context || 128_000;
  const output = limit.output || 32_000;

  return {
    model: modelId,
    label: `${meta?.name || modelId} (${source.name})`,
    contextWindow: context,
    maxOutputTokens: output,
    ...(meta?.reasoning ? { reasoning: true } : {}),
    ...(meta?.attachment ? { vision: true } : {}),
  };
}
