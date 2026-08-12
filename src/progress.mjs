// A small activity line for the startup pause.
//
// Discovery takes about a second when every provider answers, and up to the
// timeout when one does not. Without any sign of life that reads as a hang —
// especially since it happens before Copilot has drawn anything at all.
//
// It writes to stderr and only when stderr is a terminal: piped output, CI logs
// and non-interactive runs get nothing, so nothing is polluted.

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const ASCII_FRAMES = ['-', '\\', '|', '/'];
const INTERVAL_MS = 90;

/**
 * @param {object} io       The usual { stderr, env } pair.
 * @param {string[]} labels What is being waited on, one per provider.
 */
export function createProgress(io, labels = []) {
  const stderr = io.stderr;
  const enabled = Boolean(stderr?.isTTY) && !io.env?.CI && io.env?.COPILOT_BYOK_PROGRESS !== 'off';

  if (!enabled || labels.length === 0) {
    return { done: () => {}, finish: () => {} };
  }

  // Some Windows consoles still cannot render Braille; ASCII always can.
  const frames = io.env?.COPILOT_BYOK_ASCII || io.env?.TERM === 'dumb' ? ASCII_FRAMES : FRAMES;
  const total = labels.length;
  const pending = new Set(labels);
  let frame = 0;
  let width = 0;

  const render = () => {
    const spinner = frames[frame % frames.length];
    frame += 1;

    const finished = total - pending.size;
    const bar = '█'.repeat(finished) + '░'.repeat(pending.size);
    const waiting = [...pending].slice(0, 2).join(', ');
    const suffix = pending.size > 2 ? ` +${pending.size - 2}` : '';

    const line = `${spinner} copilot-byok  [${bar}] ${finished}/${total} providers  ${waiting}${suffix}`;
    width = Math.max(width, line.length);
    stderr.write(`\r${line.padEnd(width)}`);
  };

  render();
  const timer = setInterval(render, INTERVAL_MS);
  timer.unref?.(); // never keep the process alive for an animation

  const clear = () => {
    clearInterval(timer);
    stderr.write(`\r${' '.repeat(width)}\r`);
  };

  return {
    /** One provider answered. */
    done(label) {
      pending.delete(label);
      if (pending.size > 0) render();
    },

    /** Wipe the line and leave the cursor where the caller expects it. */
    finish: clear,
  };
}
