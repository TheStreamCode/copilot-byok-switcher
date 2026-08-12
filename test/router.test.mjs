import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { buildCatalog } from '../src/catalog.mjs';
import { createRouter, mergeModels } from '../src/router.mjs';
import { createUpstreamResolver } from '../src/upstream.mjs';

test('mergeModels appends BYOK entries to the GitHub list', () => {
  const payload = JSON.stringify({ data: [{ id: 'gpt-5.5' }] });
  const merged = mergeModels(payload, [{ id: 'byok-acme-x' }]);

  assert.equal(merged.injected, 1);
  const parsed = JSON.parse(merged.payload);
  assert.deepEqual(parsed.data.map((model) => model.id), ['gpt-5.5', 'byok-acme-x']);
});

test('mergeModels supports a bare array payload', () => {
  const merged = mergeModels(JSON.stringify([{ id: 'gpt-5.5' }]), [{ id: 'byok-acme-x' }]);
  assert.equal(merged.injected, 1);
  assert.equal(JSON.parse(merged.payload).length, 2);
});

test('mergeModels leaves unexpected payloads untouched', () => {
  assert.deepEqual(mergeModels('not json', [{ id: 'x' }]), { payload: 'not json', injected: 0 });
  assert.deepEqual(mergeModels('{"error":"nope"}', [{ id: 'x' }]), { payload: '{"error":"nope"}', injected: 0 });
});

test('mergeModels does not duplicate entries already present', () => {
  const payload = JSON.stringify({ data: [{ id: 'byok-acme-x' }] });
  assert.equal(mergeModels(payload, [{ id: 'byok-acme-x' }]).injected, 0);
});

test('a BYOK request reaches the provider with the real model name', async () => {
  const received = [];
  const provider = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', choices: [{ message: { content: 'ciao' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const providerPort = provider.address().port;

  const catalog = buildCatalog([{
    id: 'acme',
    name: 'Acme',
    baseUrl: `http://127.0.0.1:${providerPort}/v1`,
    apiKey: 'provider-key',
    models: [{ model: 'acme-large' }],
  }]);

  const router = createRouter({
    catalog,
    upstream: createUpstreamResolver({ explicit: 'https://upstream.invalid' }),
  });
  await new Promise((resolve) => router.listen(0, '127.0.0.1', resolve));
  const routerPort = router.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${routerPort}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer github-token' },
      body: JSON.stringify({ model: 'byok-acme-acme-large', messages: [{ role: 'user', content: 'ciao' }] }),
    });

    assert.equal(response.status, 200);
    assert.equal(received.length, 1);
    assert.equal(received[0].path, '/v1/chat/completions');
    assert.equal(received[0].body.model, 'acme-large', 'the router maps the picker id');
    assert.equal(received[0].auth, 'Bearer provider-key', 'it uses the provider key');
  } finally {
    router.closeAllConnections();
    await new Promise((resolve) => router.close(resolve));
    await new Promise((resolve) => provider.close(resolve));
  }
});

test('an unknown BYOK id fails clearly instead of reaching GitHub', async () => {
  const catalog = buildCatalog([]);
  const router = createRouter({
    catalog,
    upstream: createUpstreamResolver({ explicit: 'https://upstream.invalid' }),
  });
  await new Promise((resolve) => router.listen(0, '127.0.0.1', resolve));
  const port = router.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'byok-ghost-model', messages: [] }),
    });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.match(payload.error.message, /Unknown BYOK model/);
  } finally {
    router.closeAllConnections();
    await new Promise((resolve) => router.close(resolve));
  }
});
