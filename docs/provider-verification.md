# Provider verification

Last verified: 2026-07-31

This document separates three different levels of evidence:

1. **Endpoint**: DNS, TLS, and the documented HTTP route responded. An unauthenticated `400`, `401`, `403`, or `429` proves route reachability only.
2. **Catalog**: the switcher fetched and ranked the provider model catalog with an available API key.
3. **End-to-end**: the switcher launched GitHub Copilot CLI, Copilot called the selected provider, and a real model response completed with exit code `0`.

## Test environment

- Windows
- Node.js 24.18.0
- npm 11.16.0
- GitHub Copilot CLI 1.0.77 installed through npm as `@github/copilot`
- Switcher offline mode enabled for inference, preventing Copilot from contacting GitHub
- Custom instructions, built-in MCPs, user MCPs, and tools disabled to isolate provider behavior

## Provider matrix

| Provider | Endpoint | Authenticated catalog | End-to-end inference | Evidence |
|---|---:|---:|---:|---|
| Chutes | Yes | Yes | Yes | `moonshotai/Kimi-K3-TEE` returned the expected sentinel response; exit code `0`. |
| OpenCode Go | Yes | Yes | Not completed | The endpoint and catalog are valid; the available account returned `429 Monthly usage limit reached` before generation. |
| Fireworks AI | Yes | Not tested | Not tested | The Anthropic-compatible route returned an application-level response without credentials. |
| OpenRouter | Yes | Not tested | Not tested | The documented route required authentication. |
| Moonshot AI (Kimi) | Yes | Not tested | Not tested | The documented route required authentication. |
| DeepSeek | Yes | Not tested | Not tested | The documented route required authentication. |
| Z.ai | Yes | Not tested | Not tested | The documented Coding Plan route required authentication. |
| MiniMax | Yes | Not tested | Not tested | The documented route required authentication. |
| Alibaba Model Studio Token Plan | Yes | Not applicable | Not tested | The dedicated Beijing plan route required its plan key; no catalog endpoint is assumed. |
| Tencent Cloud Token Plan | Yes | Not applicable | Not tested | The mainland China personal-plan route required its `sk-tp-...` key; no catalog endpoint is assumed. |

Gemini is not listed as a switcher preset because it is available through Copilot's native model catalog.

## Automated verification

The repository quality gate covers argument parsing, built-in provider normalization, model ranking, secret handling, model-catalog timeout and authentication policy, Windows command injection, standalone Copilot binary discovery, offline mode, and Responses API selection.

Run:

```sh
npm ci
npm run check
npm run test:coverage
npm audit --omit=dev --audit-level=high
npm pack --dry-run
```

Provider catalogs and model availability can change independently of this repository. Re-run authenticated catalog and end-to-end checks before making a release claim for a provider that is not marked end-to-end above.
