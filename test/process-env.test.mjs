import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeCopilotEnvironment } from '../src/process-env.mjs';

test('catalog provider keys never reach the Copilot child process', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/usr/bin',
    OPENAI_API_KEY: 'secret',
    GEMINI_API_KEY: 'secret',
    DASHSCOPE_API_KEY: 'secret',
    ZHIPU_CN_API_KEY: 'secret',
    ARK_API_KEY: 'secret',
    QIANFAN_API_KEY: 'secret',
    SILICONFLOW_API_KEY: 'secret',
    OPENCODE_ZEN_API_KEY: 'secret',
  });

  assert.equal(env.PATH, '/usr/bin');
  for (const name of [
    'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DASHSCOPE_API_KEY', 'ZHIPU_CN_API_KEY',
    'ARK_API_KEY', 'QIANFAN_API_KEY', 'SILICONFLOW_API_KEY', 'OPENCODE_ZEN_API_KEY',
  ]) {
    assert.equal(env[name], undefined, `${name} must be stripped`);
  }
});

test('the COPILOT_BYOK_*_API_KEY family is stripped without listing each name', () => {
  const env = sanitizeCopilotEnvironment({
    COPILOT_BYOK_OPENAI_API_KEY: 'secret',
    COPILOT_BYOK_SOMETHING_NEW_API_KEY: 'secret',
    copilot_byok_lowercase_api_key: 'secret',
    COPILOT_BYOK_UPSTREAM: 'https://api.business.githubcopilot.com',
  });

  assert.equal(env.COPILOT_BYOK_OPENAI_API_KEY, undefined);
  assert.equal(env.COPILOT_BYOK_SOMETHING_NEW_API_KEY, undefined);
  assert.equal(env.copilot_byok_lowercase_api_key, undefined);

  // Not a credential: it must survive.
  assert.equal(env.COPILOT_BYOK_UPSTREAM, 'https://api.business.githubcopilot.com');
});

test('the router URL overlay is applied last', () => {
  const env = sanitizeCopilotEnvironment(
    { COPILOT_API_URL: 'http://stale', COPILOT_PROVIDER_BASE_URL: 'http://old' },
    { COPILOT_API_URL: 'http://127.0.0.1:41234' }
  );

  assert.equal(env.COPILOT_API_URL, 'http://127.0.0.1:41234');
  assert.equal(env.COPILOT_PROVIDER_BASE_URL, undefined);
});
