# Provider verification

Last verified: 2026-11-01 for Copilot CLI compatibility; provider endpoints and model lists
2026-10-14; end-to-end runs below are from 2026-08-12 and 2026-11-01.

This document separates three different levels of evidence, because they are not
interchangeable:

1. **Endpoint** — DNS, TLS and the documented route answered. An unauthenticated
   `400`, `401`, `403` or `429` proves the route exists; it says nothing about
   whether your key works.
2. **Catalog** — the switcher fetched and ranked the provider's model list with a
   real API key.
3. **End-to-end** — Copilot CLI ran through the router against the provider, a
   real model answered, and the agent completed a tool-using task.

## Test environment

- Windows 11, Node.js 22.17.0, npm 11.17.0
- GitHub Copilot CLI 1.0.79, personal (free) plan
- Endpoint probes: `POST /chat/completions` with a deliberately invalid key and a
  25-second timeout. No credentials were printed.
- Endpoint and model-list tables were re-probed on 2026-10-14 (Windows,
  Node.js 24.21, invalid-key probes, no credentials).
- CLI compatibility was re-verified on 2026-11-01 (Windows 11, Node.js 24.21,
  Copilot CLI 1.0.105 and 1.0.79) with an isolated `COPILOT_HOME`, mock providers
  on loopback and no real GitHub credentials.

## Copilot CLI compatibility

Re-verified on 2026-11-01 against 1.0.105, with 1.0.79 as the baseline.

| Area | 1.0.79 | 1.0.105 | Evidence |
|---|---|---|---|
| `COPILOT_API_URL` router | honoured | honoured | `GET /models` reached a local server on both; the full session completed on 1.0.105, including `POST /chat/completions` and `POST /mcp/readonly` |
| Reasoning effort to BYOK | not sent | sent | `reasoning_effort: "high"` on the wire with native provider variables, and through the router when the model entry advertises levels |
| Native `providers.json` registry | not loaded | loaded | two providers in one file; `--model p2/m2` reached the second base URL with its `wireModel` |
| Extension SDK | unchanged | unchanged | the 1.0.28 SDK still exports `joinSession`, `commands`, `ui.select` and `session.log`; extensions remain experimental and were not run interactively in this audit |
| Data residency origin | not exercised | derived, unit-tested | `dataResidencyOrigin` maps a `*.ghe.com` host to `copilot-api.<tenant>.ghe.com`; no live data residency tenant was available, so the host is inferred from upstream issue #4527 and the CLI's documented host handling, not verified end-to-end |
| `COPILOT_PROVIDER_HEADERS`, `_MODEL_ID`, `_API_KEY_COMMAND` | n/a | documented and passed through | 1.0.105 `copilot help providers` lists all three; `API_KEY_COMMAND` exists since 1.0.84 per upstream issue #4936; the environment pass-through is covered by unit tests, with no real provider run |
| `--native-byok` minimum CLI | does not load the registry | works | a manual `providers.json` was not loaded on 1.0.79; no bisect was done, so 1.0.105 is the verified version. Do not assume native mode works on older releases |

`COPILOT_API_URL` remains undocumented: it is not listed in `copilot help environment` on 1.0.105.
The native registry is the supported alternative, which is why `--native-byok` exists.

## Endpoint reachability

All entries below answered on their OpenAI-compatible route.

| Provider | Base URL | Result |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | 401 |
| Anthropic | `https://api.anthropic.com/v1` | 401 |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | 400 |
| xAI | `https://api.x.ai/v1` | 400 |
| Mistral | `https://api.mistral.ai/v1` | 401 |
| Groq | `https://api.groq.com/openai/v1` | 401 |
| Cerebras | `https://api.cerebras.ai/v1` | 401 |
| Together AI | `https://api.together.xyz/v1` | 401 |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | 401 |
| Perplexity | `https://api.perplexity.ai` | 401 |
| OpenRouter | `https://openrouter.ai/api/v1` | 401 |
| DeepSeek | `https://api.deepseek.com/v1` | 401 |
| Alibaba Qwen (intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 401 |
| Alibaba Qwen (CN) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 401 |
| Alibaba Token Plan | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | 401 |
| Z.AI | `https://api.z.ai/api/paas/v4` | 401 |
| Zhipu AI (CN) | `https://open.bigmodel.cn/api/paas/v4` | 401 |
| Moonshot Kimi | `https://api.moonshot.ai/v1` | 401 |
| MiniMax | `https://api.minimax.io/v1` | 401 |
| Meta Muse | `https://api.meta.ai/v1` | 401 |
| SiliconFlow | `https://api.siliconflow.com/v1` | 401 |
| ModelScope | `https://api-inference.modelscope.cn/v1` | 400 |
| Baichuan | `https://api.baichuan-ai.com/v1` | 401 |
| Chutes | `https://llm.chutes.ai/v1` | 401 |
| OpenCode Zen | `https://opencode.ai/zen/v1` | 401 |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | 400 |
| Baseten | `https://inference.baseten.co/v1` | 403 |

Two endpoints answered `404` to the probe because they validate the model name
before the credential, and the probe deliberately sends a non-existent model:

| Provider | Base URL | Note |
|---|---|---|
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | 404 on an unknown model |
| Nvidia NIM | `https://integrate.api.nvidia.com/v1` | 404 on an unknown model |

## Model-list endpoints

Discovery reads each provider's `GET /models`, so that route was probed for every
catalog entry. Sending no credentials returns the public catalogs below;
sending an invalid key is rejected instead, so a 401 proves the route exists
but says nothing about catalog contents. Observed 2026-10-14 via
`npm run catalog:audit` with no keys configured:

| Provider | Result |
|---|---|
| Chutes | 200 — 14 models, all usable |
| DeepInfra | 200 — 179 models, 137 usable after ranking |
| ModelScope | 200 — 36 models, 34 usable |
| Nvidia NIM | 200 — 80 models, 69 usable |
| OpenCode Go | 200 — 40 models, all usable |
| OpenCode Zen | 200 — 85 models, all usable |
| OpenRouter | 200 — 462 models, 447 usable |
| Gemini | 404 without a key (400 with an invalid one) |
| xAI | 400 (route exists, request rejected) |
| All others | 401 |
| Ollama, LM Studio | connection refused — local servers, not running here |

Some providers publish the metadata discovery needs alongside the list, which is
what lets the picker show real limits rather than defaults:

| Provider | Fields observed |
|---|---|
| Chutes | `context_length`, `max_output_length`, `supported_features: ["json_mode","tools","structured_outputs","reasoning"]` |
| OpenRouter | `context_length`, `top_provider.max_completion_tokens`, `supported_parameters` including `tools` |
| Nvidia NIM | ids only (`id`, `created`, `owned_by`) |
| ModelScope | ids only (`id`, `created`, `owned_by`) |

Providers that publish only ids still work: their limits fall back to
conservative defaults (128k context, 32k output), and a model is excluded only
when a provider explicitly says it cannot call tools.

### Discovery against real keys

| Provider | Result |
|---|---|
| Chutes | 12 models, with context and output read from the API |
| Alibaba Token Plan | 7 models |
| OpenAI | 401 — the key on this machine is not valid for `api.openai.com`; nothing remembered, so the provider stayed out of the picker, as designed |

Measured wall-clock for the three configured providers, queried in parallel: 1.2s.

## Reasoning effort

On CLI 1.0.79 the effort level never reached a BYOK provider: payloads produced with
`--effort low` and `--effort high` were byte-identical and contained no reasoning
field, in both wire formats. That was upstream
[copilot-cli#4012](https://github.com/github/copilot-cli/issues/4012), resolved later
in the 1.0.9x line.

Re-verified on 1.0.105 (2026-11-01): `--reasoning-effort high` produces
`"reasoning_effort":"high"` in the request, both with the native BYOK variables and
through the router when the model entry declares
`capabilities.supports.reasoning_effort`. Without that declaration the CLI rejects
the flag before sending anything.

Providers accept the parameter when it arrives, and they do **not** fall back on
their own. Measured against `zai-org/GLM-5.2-TEE` on Chutes:

| `reasoning_effort` | Result |
|---|---|
| `low`, `medium`, `high`, `max` | 200 |
| `xhigh` | 400 validation error |
| `banana` (control) | 400 validation error |

So a level that a model does not accept breaks every request to it, which is why
the router steps the level down until one is accepted and remembers the outcome,
including when the level came from the CLI rather than from the config.

## End-to-end

Run through the router on Copilot CLI 1.0.79, personal free plan:

| Provider | Model | Evidence |
|---|---|---|
| Chutes | `zai-org/GLM-5.2-TEE` | Model answered; picker selection reported `Model changed to: byok-…`; `AI Credits 0` |
| Chutes | `moonshotai/Kimi-K2.6-TEE` | Model answered; `AI Credits 0` |
| Chutes | `Qwen/Qwen3.5-397B-A17B-TEE` | Model answered; `AI Credits 0` |

**Harness compatibility** was checked with a task requiring real tool use, not
just chat: the agent read a file with its tools, reported the contents, and
created a second file. Copilot reported `Changes +1 -0` with prompt caching
active (57.2k cached tokens) and `AI Credits 0`.

Two providers were configured but could not complete an end-to-end run for
account reasons rather than technical ones, which is itself evidence the chain
works — the errors came back from the provider, through the router, unchanged:

| Provider | Response |
|---|---|
| OpenCode Zen / Go | `Insufficient balance` |
| Alibaba Token Plan | `Your token-plan 1-week quota has been exhausted` |

### Native registry path

On 2026-11-01, `copilot-byok --native-byok` ran on CLI 1.0.105 with an isolated
`COPILOT_HOME` and no GitHub credentials, against a local OpenAI-compatible mock.
The generated `providers.json` was accepted, Copilot sent
`POST /v1/chat/completions` with the pinned model name, used the reply, and the
temporary registry was gone after exit. This verifies the registry shape and the
clean-exit cleanup, not a real provider's inference. Signal cleanup and the
stale-registry sweep are covered by unit tests, not by this end-to-end run.

## Reproducing

```sh
copilot-byok doctor                    # installation and CLI version
copilot-byok --list-providers          # which providers your keys activate
copilot-byok models --offline          # what discovery would publish, no network
copilot-byok --dry-run                 # router URL and published model ids
copilot-byok --native-byok --dry-run   # native registry: providers and selection ids
copilot-byok -- -p "read README.md and summarise it" --allow-all-tools
```

Endpoint probes are not part of the automated test suite: they contact third-party
services and would make CI depend on their availability.
