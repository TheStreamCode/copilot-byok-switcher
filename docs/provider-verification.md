# Provider verification

Last verified: 2026-08-12

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
