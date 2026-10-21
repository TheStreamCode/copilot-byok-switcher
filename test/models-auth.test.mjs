import assert from 'node:assert/strict';
import test from 'node:test';

import { providerModelHeaders } from '../src/models-auth.mjs';

const baseProvider = {
  id: 'acme',
  name: 'Acme',
  baseUrl: 'https://api.acme.test/v1',
  modelsUrl: 'https://api.acme.test/v1/models',
  apiKey: 'secret',
};

test('a same-origin catalog receives the key by default', () => {
  const headers = providerModelHeaders(baseProvider);
  assert.equal(headers.Authorization, 'Bearer secret');
});

test('a cross-origin catalog receives no key without an explicit modelsAuth', () => {
  const headers = providerModelHeaders({
    ...baseProvider,
    modelsUrl: 'https://catalog.other.test/models',
  });
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers['x-api-key'], undefined);
  assert.equal(headers['api-key'], undefined);
});

test('an explicit bearer modelsAuth allows a cross-origin catalog', () => {
  const headers = providerModelHeaders({
    ...baseProvider,
    modelsUrl: 'https://catalog.other.test/models',
    modelsAuth: 'bearer',
  });
  assert.equal(headers.Authorization, 'Bearer secret');
});

test('modelsAuth false keeps even a same-origin catalog unauthenticated', () => {
  const headers = providerModelHeaders({ ...baseProvider, modelsAuth: false });
  assert.equal(headers.Authorization, undefined);
});

test('modelsAuth none behaves like false', () => {
  const headers = providerModelHeaders({ ...baseProvider, modelsAuth: 'none' });
  assert.equal(headers.Authorization, undefined);
});

test('modelsAuth x-api-key uses the dedicated header', () => {
  const headers = providerModelHeaders({ ...baseProvider, modelsAuth: 'x-api-key' });
  assert.equal(headers['x-api-key'], 'secret');
  assert.equal(headers.Authorization, undefined);
});

test('modelsAuth api-key uses the dedicated header', () => {
  const headers = providerModelHeaders({ ...baseProvider, modelsAuth: 'api-key' });
  assert.equal(headers['api-key'], 'secret');
  assert.equal(headers.Authorization, undefined);
});

test('provider modelsHeaders are preserved', () => {
  const headers = providerModelHeaders({
    ...baseProvider,
    modelsHeaders: { 'x-tenant': 'acme' },
  });
  assert.equal(headers['x-tenant'], 'acme');
  assert.equal(headers.Authorization, 'Bearer secret');
});

test('a bearer token is preferred over the api key in bearer mode', () => {
  const headers = providerModelHeaders({ ...baseProvider, bearerToken: 'token' });
  assert.equal(headers.Authorization, 'Bearer token');
});

test('no credential means no auth header', () => {
  const headers = providerModelHeaders({ ...baseProvider, apiKey: null });
  assert.equal(headers.Authorization, undefined);
});
