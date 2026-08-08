import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';

import { buildCopilotSpawnOptions, main } from '../src/cli.mjs';
import { sanitizeCopilotEnvironment } from '../src/process-env.mjs';

const packageVersion = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
).version;

test('prints help without touching provider config', async () => {
  const output = captureWritable();
  const exitCode = await main(['--help'], {
    stdin: { isTTY: false },
    stdout: output,
    stderr: captureWritable(),
    env: { COPILOT_BYOK_CONFIG: join(tmpdir(), 'does-not-exist.json') },
  });

  assert.equal(exitCode, 0);
  assert.match(output.text(), /^copilot-byok - switch GitHub Copilot CLI/);
  assert.match(output.text(), /-v, --version/);
});

test('prints the package version', async () => {
  const output = captureWritable();
  const exitCode = await main(['--version'], {
    stdin: { isTTY: false },
    stdout: output,
    stderr: captureWritable(),
    env: {},
  });

  assert.equal(exitCode, 0);
  assert.equal(output.text(), `${packageVersion}\n`);
});

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

test('native mode uses valid custom config to strip credential sources from the child', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-native-'));
  const configPath = join(dir, 'providers.json');
  const scriptPath = join(dir, 'capture-env.mjs');
  const outputPath = join(dir, 'env.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'custom',
      name: 'Custom',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEnv: 'CUSTOM_PROVIDER_SECRET',
    }],
  }));
  await writeFile(scriptPath, [
    "import { writeFile } from 'node:fs/promises';",
    "await writeFile(process.argv[2], JSON.stringify({",
    '  customSecretPresent: Object.hasOwn(process.env, \'CUSTOM_PROVIDER_SECRET\'),',
    '  copilotModelPresent: Object.hasOwn(process.env, \'COPILOT_MODEL\'),',
    '}));',
  ].join('\n'));

  const exitCode = await main([
    '--native',
    '--config', configPath,
    '--', scriptPath, outputPath,
  ], {
    stdin: { isTTY: false },
    stdout: captureWritable(),
    stderr: captureWritable(),
    env: {
      ...process.env,
      COPILOT_BIN: process.execPath,
      CUSTOM_PROVIDER_SECRET: 'secret',
      COPILOT_MODEL: 'stale-model',
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), {
    customSecretPresent: false,
    copilotModelPresent: false,
  });
});

test('does not expose credential configuration in missing-key errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'private-provider',
      name: 'Private Provider',
      type: 'openai',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEnv: 'SENSITIVE_CREDENTIAL_SOURCE',
      defaultModel: 'private-model',
    }],
  }));

  await assert.rejects(
    () => main([
      '--config', configPath,
      '--provider', 'private-provider',
      '--model', 'private-model',
      '--dry-run',
    ], {
      stdin: { isTTY: false },
      stdout: captureWritable(),
      stderr: captureWritable(),
      env: {},
    }),
    (error) => {
      assert.match(error.message, /Missing API key for Private Provider/);
      assert.doesNotMatch(error.message, /SENSITIVE_CREDENTIAL_SOURCE/);
      return true;
    }
  );
});

test('sanitizes stale Copilot BYOK env before launching child process', () => {
  const env = sanitizeCopilotEnvironment({
    PATH: '/bin',
    COPILOT_PROVIDER_BASE_URL: 'https://old.example.com',
    COPILOT_PROVIDER_API_KEY: 'old-secret',
    COPILOT_PROVIDER_BEARER_TOKEN: 'old-bearer',
    COPILOT_PROVIDER_WIRE_API: 'responses',
    COPILOT_PROVIDER_MAX_PROMPT_TOKENS: '1',
    COPILOT_MODEL: 'stale-model',
    COPILOT_OFFLINE: 'true',
  }, {
    COPILOT_PROVIDER_BASE_URL: 'https://new.example.com',
  });

  assert.equal(env.PATH, '/bin');
  assert.equal(env.COPILOT_PROVIDER_BASE_URL, 'https://new.example.com');
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_BEARER_TOKEN'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_WIRE_API'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_PROVIDER_MAX_PROMPT_TOKENS'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_MODEL'), false);
  assert.equal(Object.hasOwn(env, 'COPILOT_OFFLINE'), false);
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
    OPENAI_API_KEY: 'secret',
    ANTHROPIC_API_KEY: 'secret',
    GROQ_API_KEY: 'secret',
    XAI_API_KEY: 'secret',
    MISTRAL_API_KEY: 'secret',
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
  assert.equal(Object.hasOwn(env, 'OPENAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'ANTHROPIC_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'GROQ_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'XAI_API_KEY'), false);
  assert.equal(Object.hasOwn(env, 'MISTRAL_API_KEY'), false);
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

test('supports x-api-key authentication for provider model catalogs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'anthropic-catalog',
      name: 'Anthropic Catalog',
      type: 'anthropic',
      baseUrl: 'https://api.example.com',
      modelsUrl: 'https://catalog.example.net/models',
      modelsAuth: 'x-api-key',
      apiKeyEnv: 'SAFE_PROVIDER_KEY',
      bearerTokenEnv: 'SAFE_PROVIDER_BEARER',
    }],
  }));

  const previousFetch = globalThis.fetch;
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return { ok: true, json: async () => ({ data: [{ id: 'safe-model' }] }) };
  };

  try {
    await main(['--config', configPath, '--provider', 'anthropic-catalog', '--list-models'], {
      stdin: { isTTY: false },
      stdout: captureWritable(),
      stderr: captureWritable(),
      env: { SAFE_PROVIDER_KEY: 'secret', SAFE_PROVIDER_BEARER: 'bearer-secret' },
    });
    assert.equal(requestOptions.headers['x-api-key'], 'secret');
    assert.equal(Object.hasOwn(requestOptions.headers, 'Authorization'), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('allows authless providers and prefers their configured default model', async () => {
  const output = captureWritable();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ id: 'ranked-model', created: 999 }] }),
  });

  try {
    const exitCode = await main(['--provider', 'ollama', '--model', 'local-model', '--dry-run'], {
      stdin: { isTTY: false },
      stdout: output,
      stderr: captureWritable(),
      env: {},
    });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(output.text()).wireModel, 'local-model');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('places configured default model before ranked catalog results', async () => {
  const configPath = await writeProviderFixture();
  const output = captureWritable();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ id: 'newer-model', created: 999 }] }),
  });

  try {
    const exitCode = await main([
      '--config', configPath,
      '--provider', 'first',
      '--no-model-prompt',
      '--dry-run',
    ], {
      stdin: { isTTY: false },
      stdout: output,
      stderr: captureWritable(),
      env: { FIRST_PROVIDER_KEY: 'secret' },
    });
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(output.text()).wireModel, 'first-model');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('rejects model catalog responses larger than five MiB', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', {
    status: 200,
    headers: { 'content-length': String(5 * 1024 * 1024 + 1) },
  });

  try {
    await assert.rejects(
      () => main(['--provider', 'chutes', '--list-models'], {
        stdin: { isTTY: false },
        stdout: captureWritable(),
        stderr: captureWritable(),
        env: {},
      }),
      /5242880-byte limit/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('enforces the model catalog limit while streaming without content-length', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('x'.repeat(5 * 1024 * 1024 + 1), { status: 200 });

  try {
    await assert.rejects(
      () => main(['--provider', 'chutes', '--list-models'], {
        stdin: { isTTY: false },
        stdout: captureWritable(),
        stderr: captureWritable(),
        env: {},
      }),
      /5242880-byte limit/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('strips custom credential sources from native child environments', () => {
  const options = buildCopilotSpawnOptions({
    env: {},
    ioEnv: {
      PATH: '/bin',
      CUSTOM_PROVIDER_SECRET: 'secret',
      COPILOT_MODEL: 'stale',
    },
    config: {
      providers: [{ apiKeyEnv: 'CUSTOM_PROVIDER_SECRET' }],
    },
  });

  assert.equal(options.env.PATH, '/bin');
  assert.equal(Object.hasOwn(options.env, 'CUSTOM_PROVIDER_SECRET'), false);
  assert.equal(Object.hasOwn(options.env, 'COPILOT_MODEL'), false);
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

test('selects a provider from the interactive menu', async () => {
  const configPath = await writeProviderFixture();
  const output = captureWritable({ isTTY: true });

  const exitCode = await main(['--config', configPath, '--no-model-prompt', '--dry-run'], {
    stdin: readableTty(['2']),
    stdout: output,
    stderr: captureWritable(),
    env: { SECOND_PROVIDER_KEY: 'secret' },
  });

  const text = output.text();
  const result = JSON.parse(text.slice(text.indexOf('{\n')));
  assert.equal(exitCode, 0);
  assert.match(text, /2\) Second Provider/);
  assert.equal(result.provider, 'Second Provider');
  assert.equal(result.wireModel, 'second-model');
  assert.equal(result.env.COPILOT_PROVIDER_API_KEY, '<redacted>');
});

test('selects a ranked model from the interactive menu', async () => {
  const configPath = await writeProviderFixture();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
  });

  const output = captureWritable({ isTTY: true });
  try {
    const exitCode = await main(['--config', configPath, '--provider', 'first', '--dry-run'], {
      stdin: readableTty(['3']),
      stdout: output,
      stderr: captureWritable(),
      env: { FIRST_PROVIDER_KEY: 'secret' },
    });

    const text = output.text();
    const result = JSON.parse(text.slice(text.indexOf('{\n')));
    assert.equal(exitCode, 0);
    assert.match(text, /Available First Provider models/);
    assert.equal(result.wireModel, 'model-b');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('explains how to install Copilot CLI when the binary is missing', async () => {
  await assert.rejects(
    () => main(['--native'], {
      stdin: { isTTY: false },
      stdout: captureWritable(),
      stderr: captureWritable(),
      env: { COPILOT_BIN: join(tmpdir(), 'copilot-byok-missing-binary') },
    }),
    /Could not launch GitHub Copilot CLI/
  );
});

function captureWritable({ isTTY = false } = {}) {
  let buffer = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      buffer += chunk.toString();
      callback();
    },
  });
  stream.isTTY = isTTY;
  stream.text = () => buffer;
  return stream;
}

function readableTty(lines) {
  const stream = Readable.from(lines.map((line) => `${line}\n`), { objectMode: false });
  stream.isTTY = true;
  return stream;
}

async function writeProviderFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [
      {
        id: 'first',
        name: 'First Provider',
        type: 'openai',
        baseUrl: 'https://api.first.example/v1',
        modelsUrl: 'https://api.first.example/v1/models',
        apiKeyEnv: 'FIRST_PROVIDER_KEY',
        defaultModel: 'first-model',
      },
      {
        id: 'second',
        name: 'Second Provider',
        type: 'openai',
        baseUrl: 'https://api.second.example/v1',
        apiKeyEnv: 'SECOND_PROVIDER_KEY',
        defaultModel: 'second-model',
      },
    ],
  }));

  return configPath;
}
