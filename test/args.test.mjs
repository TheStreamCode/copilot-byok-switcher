import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../src/args.mjs';

test('parses switcher options without passing them to Copilot', () => {
  const parsed = parseArgs([
    '--provider',
    'chutes',
    '--model',
    'moonshotai/Kimi-K2.6-TEE',
    '-p',
    'hello',
  ]);

  assert.equal(parsed.providerName, 'chutes');
  assert.equal(parsed.explicitModel, 'moonshotai/Kimi-K2.6-TEE');
  assert.equal(parsed.listModels, false);
  assert.deepEqual(parsed.copilotArgs, ['-p', 'hello']);
});

test('rejects empty option values and incompatible model listing options', () => {
  assert.throws(() => parseArgs(['--provider=']), /requires a provider id/);
  assert.throws(() => parseArgs(['--model=']), /requires a model id/);
  assert.throws(() => parseArgs(['--config=']), /requires a file path/);
  assert.throws(() => parseArgs(['--native', '--list-models']), /requires a BYOK provider/);
  assert.throws(
    () => parseArgs(['--provider', 'chutes', '--model', 'model', '--list-models']),
    /cannot be combined/
  );
  assert.throws(() => parseArgs(['--wire-api=invalid']), /must be completions or responses/);
  assert.throws(() => parseArgs(['--native', '--offline']), /require a BYOK provider/);
});

test('parses help and version flags without forwarding them to Copilot', () => {
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);

  const parsed = parseArgs(['--version']);
  assert.equal(parsed.version, true);
  assert.deepEqual(parsed.copilotArgs, []);
});

test('parses offline mode and a Responses API override', () => {
  const parsed = parseArgs(['--provider', 'openrouter', '--offline', '--wire-api', 'RESPONSES']);

  assert.equal(parsed.offline, true);
  assert.equal(parsed.wireApi, 'responses');
  assert.deepEqual(parsed.copilotArgs, []);
});

test('keeps native Copilot --model argument in native mode', () => {
  const parsed = parseArgs(['--native', '--model', 'claude-sonnet-4.6', '-p', 'hello']);

  assert.equal(parsed.providerName, 'native');
  assert.equal(parsed.explicitModel, 'claude-sonnet-4.6');
  assert.deepEqual(parsed.copilotArgs, ['-p', 'hello']);
});
