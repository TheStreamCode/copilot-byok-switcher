# Providers and keys

Every provider below is reached through its OpenAI-compatible endpoint, verified reachable at
release time. A provider activates only when its key is present, so the `/model` picker stays as
short as your setup.

| Provider | Env var | Provider | Env var |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | DeepSeek | `DEEPSEEK_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` | Alibaba Qwen | `DASHSCOPE_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` | Alibaba Qwen (CN) | `DASHSCOPE_API_KEY_CN` |
| xAI Grok | `XAI_API_KEY` | Z.AI GLM | `ZAI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` | Zhipu AI (CN) | `ZHIPU_CN_API_KEY` |
| Meta Muse | `MODEL_API_KEY` | Moonshot Kimi | `MOONSHOT_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` | MiniMax | `MINIMAX_API_KEY` |
| Groq | `GROQ_API_KEY` | SiliconFlow | `SILICONFLOW_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` | ModelScope | `MODELSCOPE_API_KEY` |
| Together AI | `TOGETHER_API_KEY` | OpenRouter | `OPENROUTER_API_KEY` |
| DeepInfra | `DEEPINFRA_API_KEY` | Chutes | `CHUTES_API_KEY` |
| Fireworks AI | `FIREWORKS_API_KEY` | OpenCode Zen | `OPENCODE_ZEN_API_KEY` |
| Alibaba Token Plan | `ALIBABA_TOKEN_PLAN_API_KEY` | OpenCode Go | `OPENCODE_GO_API_KEY` |
| Ollama | no key needed | LM Studio | no key needed |

Each provider also accepts a `COPILOT_BYOK_<PROVIDER>_API_KEY` variant, useful when you already use
the plain name for something else.

## Where keys come from

Two sources, in this order:

1. **Environment variables** — the default and the recommendation. Nothing is written to disk, and a
   variable exported for one shell overrides everything else.
2. **The local key store** — for when a dozen `setx` calls are not appealing. Fill it with
   `copilot-byok keys set` or the `/byok` command.

The store lives at `~/.config/copilot-byok/keys.json` (`%APPDATA%\copilot-byok\keys.json` on
Windows), written with `0600` and an owner-only ACL on Windows. The trade-off is worth stating:
keys stored there are plain text on disk, protected by file permissions alone. If that does not
fit your threat model, stay with environment variables — the store is opt-in and never created
unless you use it.

Either way the keys stay out of the Copilot process: the router uses them in its own process and
strips them from the environment it hands to the agent.

No entry ships a model list: the picker is filled by live discovery. To pin exact models instead
— for an offline setup or a fixed line-up — add them in your own configuration; see
[configuration](configuration.md).

## Where the model list comes from

**Providers are asked directly.** At startup each configured provider is queried for the models it
serves right now, so the picker shows today's line-up rather than whatever was pinned at release
time — a model released this morning is there this morning. All 28 providers expose an
OpenAI-style `GET /models` (verified in [provider verification](provider-verification.md)); the
ones that also publish capabilities (Chutes, OpenRouter, NIM and others) supply the real context
window, output limit and tool-calling support along with it.

While this happens the startup shows what it is waiting on, since the pause comes before Copilot
has drawn anything:

```text
copilot-byok  [2/3 providers]  alibaba-token-plan
```

It appears only on a terminal — piped output and CI logs stay clean — and
`COPILOT_BYOK_PROGRESS=off` turns it off, `COPILOT_BYOK_ASCII=1` swaps the spinner for ASCII.

Only the providers you have a key for are queried, in parallel, with a hard timeout. Measured on
three configured providers: about a second. Results are cached for ten minutes, failures for one.

Anything the provider does not report falls back to conservative defaults (128k context, 32k
output); image input and the reasoning selector appear only when the provider's own metadata
declares them.

If a request fails — a rate limit, a blip, an expired key — the list that key returned last time
is used instead, kept in `~/.cache/copilot-byok/models.json` (`%LOCALAPPDATA%` on Windows). That
matters: a provider's catalog belongs to the plan behind your key, so only what your key actually
returned is ever offered — never a generic guess. When nothing was ever remembered, the provider
stays out of the picker and the log says why. To skip discovery entirely and work from remembered
lists:

```sh
copilot-byok --no-discovery
```

Models that cannot call tools are excluded based on the provider's own metadata: Copilot's harness
trusts what a model entry declares, and an agent that cannot call tools breaks halfway through a
session instead of failing cleanly. Embedding, image, audio and moderation models are filtered out
for the same reason. Each provider contributes at most twelve models, so a catalog like
OpenRouter's 460+ cannot swamp the picker.

## The /byok command

Copilot CLI extensions can register their own slash commands, so key management works without
leaving the session:

```sh
copilot-byok extension install
copilot-byok -- --experimental      # extensions are gated behind this flag
```

Then `/byok` opens a provider list and asks for the key:

```text
Choose a provider to configure:
  Anthropic — not configured
  Google Gemini — not configured
  DeepSeek — not configured
  OpenAI — set via environment
  Chutes — set via environment

Paste the API key for Anthropic: ****
```

`/byok list` shows the current state and `/byok remove` deletes a stored key.

One caveat: Copilot caches its model list for the lifetime of a session, so models unlocked by a
key added this way appear the **next** time you start `copilot-byok` — neither reopening the
picker nor `/restart` refreshes them.
