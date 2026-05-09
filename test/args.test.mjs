import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../src/args.mjs';

test('parses switcher options without passing them to Copilot', () => {
  const parsed = parseArgs([
    '--provider',
    'chutes',
    '--model',
    'moonshotai/Kimi-K2.6-TEE',
    '--list-models',
    '-p',
    'hello',
  ]);

  assert.equal(parsed.providerName, 'chutes');
  assert.equal(parsed.explicitModel, 'moonshotai/Kimi-K2.6-TEE');
  assert.equal(parsed.listModels, true);
  assert.deepEqual(parsed.copilotArgs, ['-p', 'hello']);
});

test('keeps native Copilot --model argument in native mode', () => {
  const parsed = parseArgs(['--native', '--model', 'claude-sonnet-4.6', '-p', 'hello']);

  assert.equal(parsed.providerName, 'native');
  assert.equal(parsed.explicitModel, 'claude-sonnet-4.6');
  assert.deepEqual(parsed.copilotArgs, ['-p', 'hello']);
});
