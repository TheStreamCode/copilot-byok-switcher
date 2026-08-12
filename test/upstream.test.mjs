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

test('a probe that fails because the network is down is not cached', async () => {
  let attempt = 0;
  const resolver = createUpstreamResolver({
    fetchImpl: async (url) => {
      attempt += 1;
      if (attempt <= UPSTREAM_CANDIDATES.length) throw new Error('network down');
      return { ok: url.startsWith(UPSTREAM_CANDIDATES[1]) };
    },
  });

  // First round: everything is unreachable, so the fallback must not stick.
  assert.equal(await resolver.resolve('Bearer t'), UPSTREAM_CANDIDATES[0]);

  // Once the network is back, detection runs again and finds the real tier.
  assert.equal(await resolver.resolve('Bearer t'), UPSTREAM_CANDIDATES[1]);
});

test('a definitive rejection from every candidate is cached', async () => {
  let calls = 0;
  const resolver = createUpstreamResolver({
    fetchImpl: async () => { calls += 1; return { ok: false, status: 403 }; },
  });

  await resolver.resolve('Bearer t');
  await resolver.resolve('Bearer t');

  assert.equal(calls, UPSTREAM_CANDIDATES.length, 'the servers answered, so there is nothing to retry');
});
