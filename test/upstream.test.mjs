import assert from 'node:assert/strict';
import test from 'node:test';

import { createUpstreamResolver, UPSTREAM_CANDIDATES } from '../src/upstream.mjs';

test('an explicit origin skips detection entirely', async () => {
  let calls = 0;
  const resolver = createUpstreamResolver({
    explicit: 'https://api.example.test',
    fetchImpl: () => { calls += 1; throw new Error('must not be called'); },
  });

  assert.equal(await resolver.resolve('Bearer t'), 'https://api.example.test');
  assert.equal(calls, 0);
});

test('detection picks the first candidate that answers', async () => {
  const tried = [];
  const resolver = createUpstreamResolver({
    fetchImpl: async (url) => {
      tried.push(url);
      return { ok: url.startsWith(UPSTREAM_CANDIDATES[1]) };
    },
  });

  assert.equal(await resolver.resolve('Bearer t'), UPSTREAM_CANDIDATES[1]);
  assert.equal(tried.length, 2);
});

test('the detected origin is cached', async () => {
  let calls = 0;
  const resolver = createUpstreamResolver({
    fetchImpl: async () => { calls += 1; return { ok: true }; },
  });

  await resolver.resolve('Bearer t');
  await resolver.resolve('Bearer t');
  assert.equal(calls, 1);
  assert.equal(resolver.current(), UPSTREAM_CANDIDATES[0]);
});

test('without a token no probe is made', async () => {
  let calls = 0;
  const resolver = createUpstreamResolver({
    fetchImpl: async () => { calls += 1; return { ok: true }; },
  });

  assert.equal(await resolver.resolve(undefined), UPSTREAM_CANDIDATES[0]);
  assert.equal(calls, 0);
});

test('when every candidate fails it falls back to the first', async () => {
  const resolver = createUpstreamResolver({
    fetchImpl: async () => { throw new Error('rete assente'); },
  });

  assert.equal(await resolver.resolve('Bearer t'), UPSTREAM_CANDIDATES[0]);
});
