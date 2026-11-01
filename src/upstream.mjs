// The Copilot API lives on different hosts depending on the account type:
//   individual  -> personal accounts (free, pro, pro+)
//   business    -> Copilot Business
//   enterprise  -> Copilot Enterprise
//
// The router cannot know the plan until a token flows through it, so on the first
// GET /models it tries the candidates in order and remembers the one that answers.

export const UPSTREAM_CANDIDATES = [
  'https://api.individual.githubcopilot.com',
  'https://api.business.githubcopilot.com',
  'https://api.enterprise.githubcopilot.com',
];

const GHE_HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ghe\.com$/i;

/**
 * GitHub Enterprise Cloud with data residency serves the Copilot API from the
 * tenant host, not from the public api.githubcopilot.com hosts. The CLI reads
 * COPILOT_GH_HOST (or GH_HOST) for its own requests, so the router derives the
 * matching origin from the same variables.
 */
export function dataResidencyOrigin(env = process.env) {
  const raw = env.COPILOT_GH_HOST || env.GH_HOST;
  if (!raw) return null;

  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!GHE_HOST_PATTERN.test(host)) return null;
  return `https://copilot-api.${host}`;
}

/**
 * @param {object} options
 * @param {string} [options.explicit]  Origin set by hand: skips detection.
 * @param {string[]} [options.candidates]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createUpstreamResolver({
  explicit,
  candidates = UPSTREAM_CANDIDATES,
  fetchImpl = fetch,
} = {}) {
  let resolved = explicit || null;
  let pending = null;

  return {
    /** Origin already known, without attempting detection. */
    current() {
      return resolved || candidates[0];
    },

    /**
     * @param {string} authorization Authorization header forwarded by the CLI.
     * @returns {Promise<string>}
     */
    async resolve(authorization) {
      if (resolved) return resolved;
      if (!authorization) return candidates[0];
      if (pending) return pending;

      pending = (async () => {
        let anyAnswered = false;

        for (const candidate of candidates) {
          try {
            const response = await fetchImpl(`${candidate}/models`, {
              headers: { authorization, 'user-agent': 'copilot-byok' },
              signal: AbortSignal.timeout(15_000),
            });
            anyAnswered = true;
            if (response.ok) {
              resolved = candidate;
              return candidate;
            }
          } catch {
            // candidate unreachable: try the next one
          }
        }

        // Only remember the fallback when the network actually answered. A blip
        // during the first probe would otherwise pin a Business or Enterprise
        // account to the individual host for the whole session.
        if (anyAnswered) resolved = candidates[0];
        return candidates[0];
      })();

      try {
        return await pending;
      } finally {
        pending = null;
      }
    },
  };
}
