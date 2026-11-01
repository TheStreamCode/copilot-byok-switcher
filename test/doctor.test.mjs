import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import { runDoctorCommand } from '../src/doctor.mjs';

test('reports a healthy installation as ok', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 0);
  const text = stdout.text();
  assert.match(text, /copilot: 1\.0\.105/);
  assert.match(text, /config: 1 providers/);
  assert.match(text, /providers: 1 of 1 have a credential/);
  assert.match(text, /native registry: .*not present/);
  assert.match(text, /No failures\./);
});

test('--json exposes the same checks', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--json', '--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(stdout.text());
  assert.equal(report.ok, true);
  assert.ok(Array.isArray(report.checks));
  assert.ok(report.checks.some((check) => check.name === 'node' && check.level === 'ok'));
});

test('a broken configuration fails the doctor', async () => {
  const { io } = await fixture();
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-doctor-'));
  const configPath = join(dir, 'broken.json');
  await writeFile(configPath, '{broken');

  const stdout = captureWritable();
  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => '1.0.105',
  });

  assert.equal(exitCode, 1);
  assert.match(stdout.text(), /FAIL config:/);
  assert.match(stdout.text(), /1 check\(s\) failed/);
});

test('a missing Copilot binary is a warning, not a failure', async () => {
  const { io, configPath } = await fixture();
  const stdout = captureWritable();

  const exitCode = await runDoctorCommand({
    argv: ['--config', configPath],
    io: { ...io, stdout },
    probeVersion: () => null,
  });

  assert.equal(exitCode, 0);
  assert.match(stdout.text(), /WARN copilot:/);
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-byok-doctor-'));
  const configPath = join(dir, 'providers.json');
  await writeFile(configPath, JSON.stringify({
    providers: [{
      id: 'echo',
      name: 'Echo',
      baseUrl: 'http://127.0.0.1:1/v1',
      authRequired: false,
      models: [{ model: 'm1' }],
    }],
  }));

  const env = {
    COPILOT_BIN: 'copilot',
    COPILOT_HOME: join(dir, 'copilot-home'),
    COPILOT_BYOK_KEYSTORE: join(dir, 'keys.json'),
    COPILOT_BYOK_MODEL_CACHE: join(dir, 'models.json'),
    COPILOT_BYOK_LOG: join(dir, 'router.log'),
    COPILOT_BYOK_SHIM_DIR: join(dir, 'shim'),
  };

  return {
    configPath,
    io: { stdout: captureWritable(), stderr: captureWritable(), env, stdin: { isTTY: false } },
  };
}

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
