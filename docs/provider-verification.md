# Provider verification

Last verified: 2026-08-12 (model-list endpoints re-verified the same day)

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
| StepFun | `https://api.stepfun.com/v1` | 401 |
| SiliconFlow | `https://api.siliconflow.com/v1` | 401 |
| ModelScope | `https://api-inference.modelscope.cn/v1` | 400 |
| ByteDance Doubao | `https://ark.cn-beijing.volces.com/api/v3` | 401 |
| Tencent Hunyuan | `https://api.hunyuan.cloud.tencent.com/v1` | 401 |
| Baidu Qianfan | `https://qianfan.baidubce.com/v2` | 401 |
| Baichuan | `https://api.baichuan-ai.com/v1` | 401 |
| Chutes | `https://llm.chutes.ai/v1` | 401 |
| OpenCode Zen | `https://opencode.ai/zen/v1` | 401 |
| Baseten | `https://inference.baseten.co/v1` | 403 |

Two endpoints answered `404` to the probe because they validate the model name
before the credential, and the probe deliberately sends a non-existent model:

| Provider | Base URL | Note |
|---|---|---|
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | 404 on an unknown model |
| Nvidia NIM | `https://integrate.api.nvidia.com/v1` | 404 on an unknown model |

## Model-list endpoints

Discovery reads each provider's `GET /models`, so that route was probed for every
catalog entry with an invalid key. **None returned 404** — every provider exposes
it. Four serve it without authentication, which is how the model counts below
were observed:

| Provider | Result |
|---|---|
| ModelScope | 200 — 43 models |
| OpenCode Go | 200 — 25 models |
| OpenCode Zen | 200 — 61 models |
| OpenRouter | 200 — 408 models, 340 declaring tool support |
| Gemini, xAI | 400 (route exists, request rejected) |
| Qianfan | 403 |
| All others | 401 |
| Ollama, LM Studio | connection refused — local servers, not running here |

Some providers publish the metadata discovery needs alongside the list, which is
what lets the picker show real limits rather than guesses:

| Provider | Fields observed |
|---|---|
| Chutes | `context_length`, `max_output_length`, `supported_features: ["json_mode","tools","structured_outputs","reasoning"]` |
| OpenRouter | `context_length`, `top_provider.max_completion_tokens`, `supported_parameters` including `tools` |

Providers that publish only ids still work: their limits come from the shipped
catalog, and a model is excluded only when a provider explicitly says it cannot
call tools.

### Discovery against real keys

| Provider | Result |
|---|---|
| Chutes | 12 models, with context and output read from the API |
| Alibaba Token Plan | 7 models |
| OpenAI | 401 — the key on this machine is not valid for `api.openai.com`; the curated list was used, as designed |

Measured wall-clock for the three configured providers, queried in parallel: 1.2s.

## Reasoning effort

Copilot's own effort setting never reaches a BYOK provider. Verified by pointing
the router at a provider that records what it receives: the payloads produced
with `--effort low` and `--effort high` are byte-identical, and contain no
reasoning field at all. Declaring `reasoning_effort` in a model entry changes only
whether the CLI accepts the flag — not what it sends.

Providers do accept the parameter when the router adds it, and they do **not** fall
back on their own. Measured against `zai-org/GLM-5.2-TEE` on Chutes:

| `reasoning_effort` | Result |
|---|---|
| `low`, `medium`, `high`, `max` | 200 |
| `xhigh` | 400 validation error |
| `banana` (control) | 400 validation error |

So a level that a model does not accept breaks every request to it, which is why
the router steps the level down until one is accepted and remembers the outcome.

The level was not delivered in any configuration tried on CLI 1.0.79: router mode
with the capability declared, the official BYOK variables over chat-completions,
the same over the responses wire format, model ids `gpt-5.4`, `gpt-5.5`,
`gpt-5.6-sol`, `claude-sonnet-4.6` and `gemini-3.1-pro-preview`, and
`COPILOT_OFFLINE=true` (the workaround reported in copilot-cli#3119). Declaring
`supported_endpoints: ['/responses']` does make the CLI switch to that format —
observed request keys: `include, input, instructions, model, parallel_tool_calls,
store, text, tools` — but still with no reasoning field.

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

## Reproducing

```sh
copilot-byok --list-providers          # which providers your keys activate
copilot-byok --dry-run                 # router URL and published model ids
copilot-byok -- -p "read README.md and summarise it" --allow-all-tools
```

Endpoint probes are not part of the automated test suite: they contact third-party
services and would make CI depend on their availability.
