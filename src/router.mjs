// Local proxy sitting between Copilot CLI and the GitHub Copilot API.
//
//   copilot --COPILOT_API_URL--> router --+--> api.<tier>.githubcopilot.com  (untouched)
//                                          \--> BYOK provider (OpenAI-compatible)
//
// It does three things and nothing else:
//   1. GET /models            appends the BYOK entries to GitHub's list
//   2. POST with a byok-* model  routes to the provider, mapping the id to the real name
//   3. everything else        passes through to GitHub, byte for byte
//
// No TLS interception: the CLI talks in the clear to 127.0.0.1 and the router opens
// its own ordinary HTTPS connection to GitHub.

import http from 'node:http';
import https from 'node:https';

import { isByokModelId } from './catalog.mjs';

const MAX_MODELS_BYTES = 8 * 1024 * 1024;

// Prompts with attachments are large, but not unbounded: this keeps a runaway
// client from growing the router's memory without limit.
const MAX_BODY_BYTES = 64 * 1024 * 1024;

// A provider that accepts the connection and then goes silent would otherwise hang
// the turn indefinitely. Generous, because reasoning models legitimately take minutes.
const PROVIDER_IDLE_TIMEOUT_MS = Number(process.env.COPILOT_BYOK_PROVIDER_TIMEOUT_MS) || 600_000;

/**
 * @param {object}   options
 * @param {object|function} options.catalog  Result of buildCatalog(), or a function
 *   returning it. A function is re-evaluated per request, so keys added during the
 *   session (for example through /byok) take effect without a restart.
 * @param {object}   options.upstream  Resolver from createUpstreamResolver().
 * @param {function} [options.onEvent] Diagnostic callback: ({type, ...}) => void
 */
export function createRouter({ catalog, upstream: resolver, onEvent = () => {} }) {
  const readCatalog = typeof catalog === 'function' ? catalog : () => catalog;

  return http.createServer((req, res) => {
    collectBody(req)
      .then(async (body) => {
        const origin = await resolver.resolve(req.headers.authorization);
        return handle({ req, res, body, catalog: await readCatalog(), upstream: new URL(origin), onEvent });
      })
      .catch((error) => {
        onEvent({ type: 'error', message: error.message });
        respondJson(res, 502, { error: { message: `copilot-byok router: ${error.message}` } });
      });
  });
}

async function handle({ req, res, body, catalog, upstream, onEvent }) {
  if (req.method === 'GET' && isModelsPath(req.url)) {
    return injectModels({ req, res, body, catalog, upstream, onEvent });
  }

  if (req.method === 'POST' && body.length) {
    const parsed = tryParseJson(body);
    if (parsed && isByokModelId(parsed.model)) {
      const route = catalog.routes.get(parsed.model);
      if (!route) {
        return respondJson(res, 404, {
          error: { message: `Unknown BYOK model: ${parsed.model}. Restart copilot-byok to rebuild the catalog.` },
        });
      }
      return forwardToProvider({ req, res, payload: parsed, route, onEvent });
    }
  }

  return passthrough({ req, res, body, upstream, onEvent });
}

function isModelsPath(url) {
  return /^\/models(\?|$)/.test(url || '');
}

// ------------------------------------------------------------------ GET /models

function injectModels({ req, res, body, catalog, upstream, onEvent }) {
  const headers = { ...req.headers, host: upstream.host };
  delete headers['accept-encoding']; // the response must be readable to be extended

  const upstreamReq = https.request(
    { hostname: upstream.hostname, port: upstream.port || 443, path: req.url, method: 'GET', headers },
    (upstreamRes) => {
      readAll(upstreamRes, MAX_MODELS_BYTES).then((raw) => {
        const merged = mergeModels(raw.toString('utf8'), catalog.entries);
        onEvent({
          type: 'models',
          status: upstreamRes.statusCode,
          injected: merged.injected,
        });

        const outHeaders = { ...upstreamRes.headers };
        delete outHeaders['content-encoding'];
        delete outHeaders['content-length'];
        res.writeHead(upstreamRes.statusCode, outHeaders);
        res.end(merged.payload);
      }).catch((error) => {
        onEvent({ type: 'error', message: `GET /models: ${error.message}` });
        res.writeHead(502).end();
      });
    }
  );

  upstreamReq.on('error', (error) => {
    onEvent({ type: 'error', message: `GET /models: ${error.message}` });
    res.writeHead(502).end();
  });
  upstreamReq.end(body);
}

/** Appends the BYOK entries, leaving GitHub's response untouched if it is not the expected JSON. */
export function mergeModels(payload, entries) {
  let json;
  try {
    json = JSON.parse(payload);
  } catch {
    return { payload, injected: 0 };
  }

  const list = Array.isArray(json) ? json : json?.data;
  if (!Array.isArray(list)) return { payload, injected: 0 };

  const known = new Set(list.map((model) => model?.id));
  let injected = 0;
  for (const entry of entries) {
    if (known.has(entry.id)) continue;
    list.push(entry);
    injected += 1;
  }

  return { payload: JSON.stringify(json), injected };
}

// ------------------------------------------------------------ forward to a provider

// Providers reject an unsupported level outright — GLM-5.2 answers 400 to
// `xhigh` while accepting `max` — and there is no server-side fallback. The level
// is stepped down until one is accepted, and the outcome is remembered so the
// same round trip is not repeated for the rest of the session.
const EFFORT_LADDER = ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'];
const rejectedEfforts = new Map();

function nextEffortDown(effort) {
  const index = EFFORT_LADDER.indexOf(effort);
  return index === -1 || index === EFFORT_LADDER.length - 1 ? null : EFFORT_LADDER[index + 1];
}

function forwardToProvider({ req, res, payload, route, onEvent }) {
  const { provider, model } = route;
  const target = new URL(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`);
  const client = target.protocol === 'https:' ? https : http;

  const outbound = { ...payload, model: model.model };

  // Copilot accepts a reasoning effort but never forwards it to a BYOK provider —
  // requests sent with low and high are identical on the wire. Applying the
  // configured level here is what makes the setting take effect at all.
  const configured = model.reasoningEffort || provider.reasoningEffort;
  if (configured && outbound.reasoning_effort === undefined) {
    const rejected = rejectedEfforts.get(`${provider.id}:${model.model}`) || new Set();
    let effort = configured;
    while (effort && rejected.has(effort)) effort = nextEffortDown(effort);
    if (effort) outbound.reasoning_effort = effort;
  }
  const body = Buffer.from(JSON.stringify(outbound), 'utf8');

  const headers = {
    accept: req.headers.accept || 'application/json',
    // Custom gateway headers come first so the computed ones below always win:
    // a stale content-length corrupts the request and a wrong host breaks TLS SNI.
    ...(provider.headers || {}),
    'content-type': 'application/json',
    'content-length': String(body.byteLength),
    host: target.host,
  };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  onEvent({ type: 'route', provider: provider.id, model: model.model });

  const providerReq = client.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname,
      method: 'POST',
      headers,
    },
    (providerRes) => {
      // A 400 caused by the effort is recoverable: drop a level and try again,
      // before a single byte has reached the client.
      if (providerRes.statusCode === 400 && outbound.reasoning_effort) {
        const key = `${provider.id}:${model.model}`;
        const rejected = rejectedEfforts.get(key) || new Set();
        rejected.add(outbound.reasoning_effort);
        rejectedEfforts.set(key, rejected);

        const fallback = nextEffortDown(outbound.reasoning_effort);
        onEvent({
          type: 'notice',
          provider: provider.id,
          message: `${model.model} rejected reasoning effort "${outbound.reasoning_effort}"`
            + (fallback ? `, retrying with "${fallback}"` : ', retrying without it'),
        });

        providerRes.resume(); // discard the error body
        return forwardToProvider({ req, res, payload, route, onEvent });
      }

      res.writeHead(providerRes.statusCode, providerRes.headers);
      providerRes.pipe(res); // SSE streaming passes through untouched
      // pipe() does not end the destination when the source fails, and an
      // IncomingMessage with no error listener swallows the error: without this
      // a provider that dies mid-stream would leave the session waiting forever.
      endOnBrokenSource(providerRes, res, (message) => {
        onEvent({ type: 'error', provider: provider.id, message });
      });
    }
  );

  providerReq.setTimeout(PROVIDER_IDLE_TIMEOUT_MS, () => {
    providerReq.destroy(new Error(`no data for ${Math.round(PROVIDER_IDLE_TIMEOUT_MS / 1000)}s`));
  });

  providerReq.on('error', (error) => {
    onEvent({ type: 'error', provider: provider.id, message: error.message });
    respondJson(res, 502, {
      error: { message: `${provider.name} is unreachable: ${error.message}` },
    });
  });

  // A cancelled generation must stop the provider request too: otherwise it keeps
  // streaming, and paid providers keep billing, for an answer nobody will read.
  res.on('close', () => {
    if (!res.writableEnded) providerReq.destroy();
  });

  providerReq.end(body);
}

// ------------------------------------------------------------------ passthrough

function passthrough({ req, res, body, upstream, onEvent }) {
  const headers = { ...req.headers, host: upstream.host };
  const upstreamReq = https.request(
    { hostname: upstream.hostname, port: upstream.port || 443, path: req.url, method: req.method, headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
      endOnBrokenSource(upstreamRes, res, (message) => {
        onEvent({ type: 'error', path: req.url, message });
      });
    }
  );

  upstreamReq.on('error', (error) => {
    onEvent({ type: 'error', path: req.url, message: error.message });
    res.writeHead(502).end();
  });

  res.on('close', () => {
    if (!res.writableEnded) upstreamReq.destroy();
  });

  upstreamReq.end(body);
}

// ---------------------------------------------------------------------- utilities

/**
 * Closes the response when the source stream breaks. Node's pipe() leaves the
 * destination open on a source error, and an IncomingMessage without an error
 * listener discards the error entirely — together that means a silent hang.
 */
function endOnBrokenSource(source, res, report) {
  const finish = (reason) => {
    report(reason);
    if (!res.writableEnded) res.end();
  };

  source.on('error', (error) => finish(`stream interrupted: ${error.message}`));
  source.on('aborted', () => finish('stream aborted by the remote end'));
}

function collectBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error(`request body exceeded the ${maxBytes}-byte limit`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readAll(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    stream.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.destroy();
        reject(new Error(`response exceeded the ${maxBytes}-byte limit`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function tryParseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

function respondJson(res, status, payload) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}
