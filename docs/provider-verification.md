# Provider verification

Last verified: 2026-08-08

This document separates three different levels of evidence:

1. **Endpoint**: DNS, TLS, and the documented HTTP route responded. An unauthenticated `400`, `401`, `403`, or `429` proves route reachability only.
2. **Catalog**: the switcher fetched and ranked the provider model catalog with an available API key.
3. **End-to-end**: the switcher launched GitHub Copilot CLI, Copilot called the selected provider, and a real model response completed with exit code `0`.

## Current test environment

- Windows
- Node.js 22.17.0
- npm 10.9.2
- GitHub Copilot CLI was not available on `PATH`, so no authenticated or end-to-end checks were repeated
- Endpoint checks used unauthenticated `GET` requests with a 10-second timeout and did not print environment variables

## Provider matrix

| Provider | Endpoint 2026-08-08 | Authenticated catalog | End-to-end inference | Evidence |
|---|---:|---:|---:|---|
| OpenAI | Yes (`401`) | Not tested | Not tested | The official Models API route required authentication. |
| Anthropic | Yes (`401`) | Not tested | Not tested | The official Models API route required `x-api-key` authentication. |
| Ollama | Not reached | Not applicable | Not tested | No local Ollama service was listening on `localhost:11434`; the preset itself requires no key. |
| Chutes | Yes (`200`) | Historical | Historical success | On 2026-07-31, the catalog loaded and `moonshotai/Kimi-K3-TEE` returned the expected sentinel response with exit code `0`; this was not repeated. |
| OpenCode Go | Yes (`200`) | Historical | Historical incomplete | On 2026-07-31, the catalog loaded but the available account returned `429 Monthly usage limit reached` before generation. Both protocol presets use the same current catalog. |
| Fireworks AI | Yes (`401`) | Not tested | Not tested | The documented catalog route required authentication. |
| OpenRouter | Yes (`200`) | Not tested | Not tested | The public filtered catalog route responded; provider inference was not tested. |
| Moonshot AI (Kimi) | Yes (`401`) | Not tested | Not tested | The documented route required authentication. |
| DeepSeek | Yes (`401`) | Not tested | Not tested | The documented route required authentication. |
| Groq | Yes (`401`) | Not tested | Not tested | The official Models API route required authentication. |
| xAI | Yes (`401`) | Not tested | Not tested | The official Models API route required authentication. |
| Mistral AI | Yes (`401`) | Not tested | Not tested | The official Models API route required authentication. |
| Z.ai Coding Plan | Yes (`401`) | Not tested | Not tested | The documented Coding Plan route required authentication. |
| Z.ai API | Yes (`401`) | Not tested | Not tested | The documented pay-as-you-go route required authentication. |
| MiniMax | Yes (`401`) | Not tested | Not tested | The documented route required authentication. |
| Alibaba Model Studio Token Plan | Yes (`401`) | Not applicable | Not tested | The dedicated Beijing plan route required its plan key; no catalog endpoint is assumed. |
| Tencent Cloud Token Plan | Yes (`401`) | Not applicable | Not tested | The mainland China personal-plan route required its `sk-tp-...` key; no catalog endpoint is assumed. |

Gemini is not listed as a switcher preset because it is available through Copilot's native model catalog. Together, Cerebras, Azure, Foundry Local, LM Studio, and vLLM remain available through custom provider configuration rather than fixed presets.

## Automated verification

The repository quality gate covers argument parsing, built-in provider normalization, model ranking and protocol filtering, authless providers, secret handling, catalog authentication modes, catalog response limits and timeouts, Windows command injection, standalone Copilot binary discovery, offline mode, and Responses API selection.

Run:

```sh
npm ci
npm run check
npm run test:coverage
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm audit signatures
npm pack --dry-run
```

Provider catalogs and model availability can change independently of this repository. Re-run authenticated catalog and end-to-end checks before making a release claim for a provider that is not marked end-to-end above.
