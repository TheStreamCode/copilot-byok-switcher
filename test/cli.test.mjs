import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.mjs';
import { buildCopilotSpawnOptions } from '../src/cli.mjs';
import { sanitizeCopilotEnvironment } from '../src/process-env.mjs';

test('native mode does not require provider config to parse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'broken.json');
  await writeFile(configPath, '{not json');

  const output = captureWritable();
  const exitCode = await main(['--native', '--dry-run'], {
    stdin: { isTTY: false },
    stdout: output,
    stderr: captureWritable(),
    env: { COPILOT_BYOK_CONFIG: configPath },
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.text()).native, true);
});

test('sanitizes stale Copilot BYOK env before launching child process', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/bin',
    COPILOT_PROVIDER_BASE_URL: 'https://old.example.com',
    COPILOT_PROVIDER_API_KEY: 'old-secret',
    COPILOT_PROVIDER_BEARER_TOKEN: 'old-bearer',
    COPILOT_PROVIDER_WIRE_API: 'responses',
    COPILOT_PROVIDER_MAX_PROMPT_TOKENS: '1',
  }, {
    COPILOT_PROVIDER_BASE_URL: 'https://new.example.com',
  });

  assert.equal(env.PATH, '/bin');
  assert.equal(env.COPILOT_PROVIDER_BASE_URL, 'https://new.example.com');
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_BEARER_TOKEN'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_WIRE_API'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_MAX_PROMPT_TOKENS'), false);
});

test('sanitizes provider source key environment variables', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/bin',
    CHUTES_API_KEY: 'secret',
    OPENCODE_GO_API_KEY: 'secret',
    FIREWORKS_API_KEY: 'secret',
    DEEPSEEK_API_KEY: 'secret',
    COPILOT_DEEPSEEK_API_KEY: 'secret',
    ZAI_API_KEY: 'secret',
    Z_AI_API_KEY: 'secret',
    GLM_API_KEY: 'secret',
    COPILOT_ZAI_API_KEY: 'secret',
    MINIMAX_API_KEY: 'secret',
    COPILOT_MINIMAX_API_KEY: 'secret',
    OPENROUTER_API_KEY: 'secret',
    MOONSHOT_API_KEY: 'secret',
    ALIBABA_TOKEN_PLAN_API_KEY: 'secret',
    TENCENT_TOKEN_PLAN_API_KEY: 'secret',
  }, {});

  assert.equal(env.PATH, '/bin');
  assert.equal(Object.hasOwn(env, 'CHUTES_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'OPENCODE_GO_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'FIREWORKS_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'DEEPSEEK_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_DEEPSEEK_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'ZAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'Z_AI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'GLM_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_ZAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'MINIMAX_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_MINIMAX_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'OPENROUTER_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'MOONSHOT_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'ALIBABA_TOKEN_PLAN_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'TENCENT_TOKEN_PLAN_API_KEY'), false);
});

test('applies offline and Responses API overrides to the Copilot child environment', async () => {
  const output = captureWritable();
  const exitCode = await main([
    '--provider', 'openrouter',
    '--model', 'openrouter/auto',
    '--offline',
    '--wire-api', 'responses',
    '--dry-run',
  ], {
    stdin: { isTTY: false },
    stdout: output,
    stderr: captureWritable(),
    env: { OPENROUTER_API_KEY: 'secret' },
  });

  const result = JSON.parse(output.text());
  assert.equal(exitCode, 0);
  assert.equal(result.env.COPILOT_OFFLINE, 'true');
  assert.equal(result.env.COPILOT_PROVIDER_WIRE_API, 'responses');
  assert.equal(result.env.COPILOT_PROVIDER_API_KEY, '<redacted>');
});

test('rejects OpenAI wire API overrides for Anthropic providers', async () => {
  await assert.rejects(
    () => main([
      '--provider', 'fireworks',
      '--model', 'accounts/fireworks/models/example',
      '--wire-api', 'responses',
      '--dry-run',
    ], {
      stdin: { isTTY: false },
      stdout: captureWritable(),
      stderr: captureWritable(),
      env: { FIREWORKS_API_KEY: 'secret' },
    }),
    /only for OpenAI-compatible/
  );
});

test('sanitizes provider environment variables case-insensitively', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/bin',
    copilot_provider_api_key: 'secret',
    chutes_api_key: 'secret',
  });

  assert.equal(env.PATH, '/bin');
  assert.equal(Object.hasOwn(env, 'copilot_provider_api_key'), false);
  assert.equal(Object.hasOwn(env, 'chutes_api_key'), false);
});

test('uses shell-free spawn options on every platform', () => {
  const options = buildCopilotSpawnOptions({ env: {} });

  assert.equal(options.shell, false);
});

test('preserves metacharacters when launching a Windows command shim', {
  skip: process.platform !== 'win32',
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-shim-'));
  const scriptPath = join(dir, 'mock-copilot.mjs');
  const commandPath = join(dir, 'mock-copilot.cmd');
  const outputPath = join(dir, 'args.json');
  const injectedPath = join(dir, 'injected.txt');
  const dangerousArg = `hello & echo injected>${injectedPath}`;

  await writeFile(scriptPath, [
    "import { writeFile } from 'node:fs/promises';",
    'const [outputPath, ...args] = process.argv.slice(2);',
    "await writeFile(outputPath, JSON.stringify(args), 'utf8');",
  ].join('\n'));
  await writeFile(commandPath, `@echo off\r\n"${process.execPath}" "%~dp0mock-copilot.mjs" %*\r\n`);

  const exitCode = await main(['--native', '--', outputPath, dangerousArg], {
    stdin: { isTTY: false },
    stdout: captureWritable(),
    stderr: captureWritable(),
    env: { ...process.env, COPILOT_BIN: commandPath },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), [dangerousArg]);
  await assert.rejects(() => readFile(injectedPath, 'utf8'), { code: 'ENOENT' });
});

test('list-models fails when provider catalog request fails', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  });

  try {
    await assert.rejects(
      () => main(['--provider', 'chutes', '--list-models'], {
        stdin: { isTTY: false },
        stdout: captureWritable(),
        stderr: captureWritable(),
        env: {},
      }),
      /401 Unauthorized/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('does not send provider credentials to a cross-origin model catalog by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'safe',
      name: 'Safe Provider',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelsUrl: 'https://catalog.example.net/models',
      apiKeyEnv: 'SAFE_PROVIDER_KEY',
      defaultModel: 'safe-model',
    }],
  }));

  const previousFetch = globalThis.fetch;
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return { ok: true, json: async () => ({ data: [{ id: 'safe-model' }] }) };
  };

  try {
    const exitCode = await main(['--config', configPath, '--provider', 'safe', '--list-models'], {
      stdin: { isTTY: false },
      stdout: captureWritable(),
      stderr: captureWritable(),
      env: { SAFE_PROVIDER_KEY: 'secret' },
    });

    assert.equal(exitCode, 0);
    assert.equal(Object.hasOwn(requestOptions.headers, 'Authorization'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('allows explicit authentication for a cross-origin model catalog', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'authenticated',
      name: 'Authenticated Catalog',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelsUrl: 'https://catalog.example.net/models',
      modelsAuth: true,
      apiKeyEnv: 'SAFE_PROVIDER_KEY',
    }],
  }));

  const previousFetch = globalThis.fetch;
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return { ok: true, json: async () => ({ data: [{ id: 'safe-model' }] }) };
  };

  try {
    await main(['--config', configPath, '--provider', 'authenticated', '--list-models'], {
      stdin: { isTTY: false },
      stdout: captureWritable(),
      stderr: captureWritable(),
      env: { SAFE_PROVIDER_KEY: 'secret' },
    });
    assert.equal(requestOptions.headers.Authorization, 'Bearer secret');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('times out model catalog requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'slow',
      name: 'Slow Provider',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      modelsUrl: 'https://api.example.com/v1/models',
      modelsTimeoutMs: 10,
    }],
  }));

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, { signal }) => new Promise((resolve, reject) => {
    const watchdog = setTimeout(() => resolve({
      ok: true,
      json: async () => ({ data: [] }),
    }), 1_000);
    signal.addEventListener('abort', () => {
      clearTimeout(watchdog);
      reject(signal.reason);
    }, { once: true });
  });

  try {
    await assert.rejects(
      () => main(['--config', configPath, '--provider', 'slow', '--list-models'], {
        stdin: { isTTY: false },
        stdout: captureWritable(),
        stderr: captureWritable(),
        env: {},
      }),
      /timed out after 10ms/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

function captureWritable() {
  let buffer = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });
  stream.text = () => buffer;
  return stream;
}
