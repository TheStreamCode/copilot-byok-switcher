import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveCopilotBin } from '../src/copilot-bin.mjs';

test('prefers an npm Copilot binary over the stale VS Code shim on Windows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'copilot-bin-'));
  const shimDir = join(root, 'globalStorage', 'github.copilot-chat', 'copilotCli');
  const npmDir = await mkdtemp(join(tmpdir(), 'copilot-npm-'));
  await mkdir(shimDir, { recursive: true });
  await writeFile(join(shimDir, 'copilot.bat'), '@exit /b 1\r\n');
  await writeFile(join(npmDir, 'copilot.cmd'), '@exit /b 0\r\n');

  const resolved = resolveCopilotBin({
    env: { Path: `${shimDir};${npmDir}` },
    platform: 'win32',
  });

  assert.equal(resolved, join(npmDir, 'copilot.cmd'));
});

test('honors COPILOT_BIN and falls back to the command name', () => {
  assert.equal(resolveCopilotBin({ env: { COPILOT_BIN: ' custom-copilot ' } }), 'custom-copilot');
  assert.equal(resolveCopilotBin({ env: {}, platform: 'linux' }), 'copilot');
});
