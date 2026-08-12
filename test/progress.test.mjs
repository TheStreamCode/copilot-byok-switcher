import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';

import { createProgress } from '../src/progress.mjs';

function fakeStderr({ isTTY = true } = {}) {
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  stream.isTTY = isTTY;
  stream.text = () => chunks.join('');
  return stream;
}

test('nothing is written when stderr is not a terminal', () => {
  const stderr = fakeStderr({ isTTY: false });
  const progress = createProgress({ stderr, env: {} }, ['a', 'b']);

  progress.done('a');
  progress.finish();

  assert.equal(stderr.text(), '', 'piped output and logs must stay clean');
});

test('nothing is written under CI', () => {
  const stderr = fakeStderr();
  const progress = createProgress({ stderr, env: { CI: 'true' } }, ['a']);

  progress.finish();
  assert.equal(stderr.text(), '');
});

test('it can be turned off explicitly', () => {
  const stderr = fakeStderr();
  createProgress({ stderr, env: { COPILOT_BYOK_PROGRESS: 'off' } }, ['a']).finish();

  assert.equal(stderr.text(), '');
});

test('nothing is written when there is nothing to wait for', () => {
  const stderr = fakeStderr();
  createProgress({ stderr, env: {} }, []).finish();

  assert.equal(stderr.text(), '');
});

test('the line shows progress and what is still pending', () => {
  const stderr = fakeStderr();
  const progress = createProgress({ stderr, env: {} }, ['openai', 'chutes', 'qwen']);

  assert.match(stderr.text(), /0\/3 providers/);
  assert.match(stderr.text(), /openai, chutes \+1/, 'the third is summarised, not listed');

  progress.done('openai');
  assert.match(stderr.text(), /1\/3 providers/);

  progress.finish();
});

test('finish wipes the line so the next message starts clean', () => {
  const stderr = fakeStderr();
  const progress = createProgress({ stderr, env: {} }, ['a']);
  progress.finish();

  const written = stderr.text();
  assert.ok(written.endsWith('\r'), 'the cursor returns to the start of the line');
  assert.match(written, /\r {2,}\r$/, 'the line is blanked, not just left behind');
});

test('an unknown label does not disturb the count', () => {
  const stderr = fakeStderr();
  const progress = createProgress({ stderr, env: {} }, ['a', 'b']);

  progress.done('not-listed');
  assert.match(stderr.text(), /0\/2 providers/);

  progress.finish();
});

test('ASCII frames are used where Braille may not render', () => {
  const stderr = fakeStderr();
  createProgress({ stderr, env: { COPILOT_BYOK_ASCII: '1' } }, ['a']).finish();

  assert.doesNotMatch(stderr.text(), /[⠋⠙⠹]/);
  assert.match(stderr.text(), /[-\\|/] copilot-byok/);
});
