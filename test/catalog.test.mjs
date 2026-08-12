import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCatalog, buildModelId, isByokModelId } from '../src/catalog.mjs';
import { selectActiveProviders } from '../src/launcher.mjs';

const provider = {
  id: 'acme',
  name: 'Acme',
  baseUrl: 'https://api.acme.test/v1',
  apiKey: 'secret',
  models: [
    { model: 'acme-large', label: 'Acme Large', contextWindow: 400_000, maxOutputTokens: 64_000 },
    { model: 'acme/small-v2', contextWindow: 32_000, maxOutputTokens: 8_000 },
  ],
};

test('model ids are stable, lowercase, and free of slashes', () => {
  assert.equal(buildModelId('acme', 'acme/small-v2'), 'byok-acme-acme-small-v2');
  assert.equal(buildModelId('acme', 'GLM-5.2'), 'byok-acme-glm-5-2');
  assert.ok(isByokModelId('byok-acme-glm-5-2'));
  assert.ok(!isByokModelId('gpt-5.5'));
});

test('catalog entries declare the capabilities the Copilot harness needs', () => {
  const { entries, routes } = buildCatalog([provider]);

  assert.equal(entries.length, 2);
  const [large] = entries;

  assert.equal(large.name, 'Acme Large');
  assert.equal(large.vendor, 'Acme');
  assert.equal(large.object, 'model');
  assert.equal(large.model_picker_enabled, true);
  assert.equal(large.capabilities.type, 'chat');
  assert.equal(large.capabilities.supports.tool_calls, true);
  assert.equal(large.capabilities.supports.streaming, true);
  assert.equal(large.capabilities.limits.max_context_window_tokens, 400_000);
  assert.equal(large.capabilities.limits.max_output_tokens, 64_000);
  assert.ok(large.capabilities.limits.max_prompt_tokens < 400_000);
  assert.deepEqual(large.supported_endpoints, ['/chat/completions']);

  // The route points back at the provider object, so the router knows where to forward.
  const route = routes.get(large.id);
  assert.equal(route.provider.id, 'acme');
  assert.equal(route.model.model, 'acme-large');
});

test('entries never leak credentials', () => {
  const { entries } = buildCatalog([provider]);
  assert.ok(!JSON.stringify(entries).includes('secret'));
});

test('duplicate model ids are collapsed', () => {
  const twin = { ...provider, models: [provider.models[0], provider.models[0]] };
  const { entries } = buildCatalog([twin]);
  assert.equal(entries.length, 1);
});

test('only providers with models and credentials are activated', () => {
  const providers = [
    { id: 'ready', models: [{ model: 'a' }], apiKey: 'k' },
    { id: 'no-key', models: [{ model: 'a' }] },
    { id: 'no-models', models: [], apiKey: 'k' },
    { id: 'local', models: [{ model: 'a' }], authRequired: false },
    { id: 'disabled', models: [{ model: 'a' }], apiKey: 'k', enabled: false },
    { id: 'bearer', models: [{ model: 'a' }], bearerToken: 't' },
  ];

  assert.deepEqual(
    selectActiveProviders(providers).map((entry) => entry.id),
    ['ready', 'local', 'bearer']
  );
});

test('prompt and output budgets fit inside the context window', () => {
  const cases = [
    { context: 500_000, output: 500_000 },   // Grok 4.5: output as large as context
    { context: 1_000_000, output: 384_000 }, // DeepSeek V4 Pro
    { context: 200_000, output: 131_072 },   // GLM-5.1
    { context: 128_000, output: 8_000 },     // ordinary case
  ];

  for (const { context, output } of cases) {
    const { entries } = buildCatalog([{
      id: 'p', name: 'P', baseUrl: 'https://x.test/v1', apiKey: 'k',
      models: [{ model: 'm', contextWindow: context, maxOutputTokens: output }],
    }]);

    const limits = entries[0].capabilities.limits;
    assert.ok(
      limits.max_prompt_tokens + limits.max_output_tokens <= limits.max_context_window_tokens,
      `prompt ${limits.max_prompt_tokens} + output ${limits.max_output_tokens} exceeds ${context}`
    );
    assert.ok(limits.max_prompt_tokens > 0);
  }
});

test('the shipped catalog never advertises more than a model can hold', async () => {
  const { readFile } = await import('node:fs/promises');
  const catalog = JSON.parse(await readFile(new URL('../src/providers.default.json', import.meta.url), 'utf8'));

  const providers = catalog.providers
    .filter((provider) => provider.models.length)
    .map((provider) => ({ ...provider, apiKey: 'k' }));

  for (const entry of buildCatalog(providers).entries) {
    const { max_prompt_tokens: prompt, max_output_tokens: output, max_context_window_tokens: context } =
      entry.capabilities.limits;
    assert.ok(prompt + output <= context, `${entry.id}: ${prompt} + ${output} > ${context}`);
  }
});

test('models whose names collide are reported rather than dropped in silence', () => {
  const events = [];
  const { entries } = buildCatalog([{
    id: 'p', name: 'P', baseUrl: 'https://x.test/v1', apiKey: 'k',
    models: [{ model: 'gpt-4.1' }, { model: 'gpt-4-1' }],
  }], (event) => events.push(event));

  assert.equal(entries.length, 1);
  assert.match(events[0].message, /collide as byok-p-gpt-4-1/);
});
