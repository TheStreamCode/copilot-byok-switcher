# Copilot BYOK Switcher

[![npm version](https://img.shields.io/npm/v/copilot-byok-switcher)](https://www.npmjs.com/package/copilot-byok-switcher)
[![CI](https://github.com/TheStreamCode/copilot-byok-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/copilot-byok-switcher/actions/workflows/ci.yml)
[![node-current](https://img.shields.io/node/v/copilot-byok-switcher)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/copilot-byok-switcher)](LICENSE)

**Your own provider models, inside the GitHub Copilot CLI `/model` picker — in the same session as the GitHub ones.**

```sh
npm install -g copilot-byok-switcher
```

Created by [Michael Gasperini](https://mikesoft.it).

## What you get

Start Copilot the way you always do, open `/model`, and find your own models listed next to GitHub's:

```
Recommended models
❯ Auto
New models
  Claude Sonnet 4.6 (Anthropic)      ← your Anthropic key
  GPT-5.5 (OpenAI)                   ← your OpenAI key
  DeepSeek V4 Pro (DeepSeek)         ← your DeepSeek key
  GLM-5.2 (Z.AI GLM)                 ← your Z.AI key
  Qwen3 Coder Plus (Alibaba Qwen)    ← your DashScope key
Unavailable models
  claude-sonnet-5
  ...
```

Pick one and the session talks straight to that provider. GitHub authentication stays intact, every other Copilot feature keeps working, and those turns cost **zero AI credits** — you pay your provider directly.

The list is not hard-coded: each provider is asked what it serves at startup, so a model released this morning is in the picker this morning.

```
● Model changed to: byok-anthropic-claude-sonnet-4-6 for this session
```

## Why this exists

Copilot CLI does support BYOK out of the box, through `COPILOT_PROVIDER_BASE_URL`. That path has three limits this project removes:

| | Built-in BYOK | Copilot BYOK Switcher |
|---|---|---|
| Providers per session | one | as many as you configure |
| `/model` picker | shows nothing to choose from | your models listed with GitHub's |
| GitHub models | unavailable while BYOK is on | still there, same session |
| Switching model | restart with new env vars | `/model` inside the session |

Bringing your **own key** for OpenAI, Anthropic or Gemini is not possible natively on personal accounts at all — GitHub reserves that for enterprise owners, who get custom models in the picker. On a personal plan those vendors appear in the picker but are served by GitHub's own subscription: they consume premium requests and follow your plan's restrictions. On the free plan most of them are visible yet unusable.

## How it works

Copilot CLI reads an environment variable, `COPILOT_API_URL`, that repoints its API endpoint anywhere — including plain HTTP on localhost. The switcher starts a small local router there:

```
copilot ──COPILOT_API_URL──> router ──┬──> api.<tier>.githubcopilot.com   (everything else, untouched)
                                       └──> your providers (OpenAI-compatible)
```

The router does exactly three things:

1. **`GET /models`** — takes GitHub's list and appends your models, so the picker shows them.
2. **`POST` with one of your models** — recognises the `byok-*` id, maps it back to the provider's real model name, forwards it, and streams the response through untouched.
3. **Everything else** — passes to GitHub byte for byte.

There is no TLS interception: Copilot talks in the clear to `127.0.0.1`, and the router opens its own ordinary HTTPS connection to GitHub. The router listens on an ephemeral port bound to loopback and shuts down when Copilot exits.

> [!IMPORTANT]
> `COPILOT_API_URL` is an internal variable — it is not listed in `copilot help environment`. It works today (verified on CLI 1.0.79) but GitHub may rename or change it. If your models ever vanish from the picker, that is the first thing to check, and `copilot-byok --native` always gets you back to a stock session.

## Quick start

```sh
# 1. Store a key for each provider you own (prompted, never echoed)
copilot-byok keys set openai
copilot-byok keys set anthropic

# 2. See what is active
copilot-byok --list-providers

# 3. Start Copilot
copilot-byok
```

Then `/model` inside the session. Arguments after `--` go to Copilot unchanged:

```sh
copilot-byok -- -p "fix the failing test" --allow-all-tools
```

## Providers

Every provider below is reached through its OpenAI-compatible endpoint, verified reachable at release time. A provider **activates only when its key is present**, so the picker stays as short as your setup.

| Provider | Env var | Provider | Env var |
|---|---|---|---|
| OpenAI | `OPENAI_API_KEY` | DeepSeek | `DEEPSEEK_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` | Alibaba Qwen | `DASHSCOPE_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` | Z.AI GLM | `ZAI_API_KEY` |
| xAI Grok | `XAI_API_KEY` | Zhipu AI (CN) | `ZHIPU_CN_API_KEY` |
| Mistral | `MISTRAL_API_KEY` | Moonshot Kimi | `MOONSHOT_API_KEY` |
| Groq | `GROQ_API_KEY` | MiniMax | `MINIMAX_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` | StepFun | `STEPFUN_API_KEY` |
| Together AI | `TOGETHER_API_KEY` | ByteDance Doubao | `ARK_API_KEY` |
| DeepInfra | `DEEPINFRA_API_KEY` | Tencent Hunyuan | `HUNYUAN_API_KEY` |
| Fireworks AI | `FIREWORKS_API_KEY` | Baidu Qianfan | `QIANFAN_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` | SiliconFlow | `SILICONFLOW_API_KEY` |
| Chutes | `CHUTES_API_KEY` | ModelScope | `MODELSCOPE_API_KEY` |
| OpenCode Zen | `OPENCODE_ZEN_API_KEY` | Alibaba Token Plan | `ALIBABA_TOKEN_PLAN_API_KEY` |
| OpenCode Go | `OPENCODE_GO_API_KEY` | Ollama / LM Studio | no key needed |

Each provider also accepts a `COPILOT_BYOK_<PROVIDER>_API_KEY` variant, useful when you already use the plain name for something else.

### Where keys come from

Two sources, in this order:

1. **Environment variables** — the default and the recommendation. Nothing is written to disk, and a variable exported for one shell overrides everything else.
2. **The local key store** — for when a dozen `setx` calls are not appealing. Fill it with `copilot-byok keys set` or the [`/byok` command](#the-byok-command).

The store lives at `~/.config/copilot-byok/keys.json` (`%APPDATA%\copilot-byok\keys.json` on Windows), written with `0600` and an owner-only ACL on Windows. The trade-off is worth stating: **keys stored there are plain text on disk**, protected by file permissions alone. If that does not fit your threat model, stay with environment variables — the store is opt-in and never created unless you use it.

Either way the keys stay out of the Copilot process: the router uses them in its own, and strips them from the environment it hands to the agent.

Some entries ship without a preset model list, either because their model names are account-specific (Volcengine endpoint ids) or because the catalog is too large to curate (OpenRouter). Add the ones you want in your own config — see below.

### Where the model list comes from

**Providers are asked directly.** At startup each configured provider is queried
for the models it serves right now, so the picker shows today's line-up rather
than whatever was curated at release time — a model released this morning is
there this morning. All 30 providers were verified to expose an OpenAI-style
`GET /models`; the ones that also publish capabilities (Chutes, OpenRouter and
others) supply the real context window, output limit and tool-calling support
along with it.

While this happens the startup shows what it is waiting on, since the pause comes
before Copilot has drawn anything:

```
⠹ copilot-byok  [██░] 2/3 providers  alibaba-token-plan
```

It appears only on a terminal — piped output and CI logs stay clean —
and `COPILOT_BYOK_PROGRESS=off` turns it off, `COPILOT_BYOK_ASCII=1` swaps the
spinner for ASCII.

Only the providers you have a key for are queried, in parallel, with a hard
timeout. Measured on three configured providers: about a second. Results are
cached for ten minutes, failures for one.

Anything the provider does not report is filled in from the shipped catalog,
which is generated from [models.dev](https://models.dev) and refreshed with:

```sh
npm run catalog:update
```

If a request fails — a rate limit, a blip, an expired key — the list that key
returned last time is used instead, kept in `~/.cache/copilot-byok/models.json`
(`%LOCALAPPDATA%` on Windows). That matters: the shipped list is generic, while a
provider's catalog belongs to the plan behind your key, so falling back to it can
offer models your plan does not include and hide ones it does. Only when nothing
was ever remembered does the shipped list step in, so a hiccup never empties the
picker. To skip discovery entirely and always use the shipped lists:

```sh
copilot-byok --no-discovery
```

Models that cannot call tools are excluded, whether that is known from the
provider's own metadata or from the catalog: Copilot's harness trusts what a
model entry declares, and an agent that cannot call tools breaks halfway through
a session instead of failing cleanly. Embedding, image, audio and moderation
models are filtered out for the same reason. Each provider contributes at most
twelve models, so a catalog like OpenRouter's 400+ cannot swamp the picker.

## The /byok command

Copilot CLI extensions can register their own slash commands, so key management
works without leaving the session:

```sh
copilot-byok extension install
copilot-byok -- --experimental      # extensions are gated behind this flag
```

Then `/byok` opens a provider list and asks for the key:

```
Choose a provider to configure:
❯ Anthropic — not configured (4 models)
  Google Gemini — not configured (3 models)
  DeepSeek — not configured (4 models)
  OpenAI — set via environment
  Chutes — set via environment

Paste the API key for Anthropic: ****
```

`/byok list` shows the current state and `/byok remove` deletes a stored key.

One caveat: Copilot caches its model list for the lifetime of a session, so
models unlocked by a key added this way appear the **next** time you start
`copilot-byok` — neither reopening the picker nor `/restart` refreshes them.

## Making plain `copilot` use it

By default the two commands stay separate: `copilot` is GitHub's CLI, `copilot-byok`
is this one. If you would rather type `copilot` and get your models:

```sh
copilot-byok shim install
copilot-byok shim status      # says which mechanism is actually in effect
```

It does two things, because on many machines one is not enough:

- writes a small `copilot` into `~/.local/share/copilot-byok/bin`
  (`%APPDATA%\copilot-byok\bin` on Windows, plus a `.cmd`), and
- adds a `copilot` function to your shell profiles.

The function is what makes it work when another `copilot` sits earlier on PATH. On
Windows that is the normal case: the **system** PATH is searched before the user
one, so a CLI installed machine-wide beats anything you can add for your own user
— a shim alone would never be reached. A shell function takes precedence over PATH
entirely, in PowerShell and in POSIX shells alike.

Both mechanisms hand the real CLI's path to the launcher through `COPILOT_BIN`,
which is what stops it resolving the shim and calling itself. `copilot-vanilla`
runs the original CLI, and `copilot-byok shim uninstall` removes everything it
wrote — the profile block is delimited by markers, so the rest of your profile is
never touched.

Open a **new** terminal afterwards. PowerShell 5.1 and PowerShell 7 read different
profile files; both are handled.

## Reasoning effort

Copilot's own `--effort` flag and its effort selector do not reach BYOK providers.
Verified against a provider that records what it receives: the payloads produced
with `low` and with `high` are byte-identical, in both wire formats. This is a
known CLI bug rather than a limitation of BYOK itself — see
[copilot-cli#4012](https://github.com/github/copilot-cli/issues/4012) (still open,
same symptom on GLM-5.2),
[#3119](https://github.com/github/copilot-cli/issues/3119) and
[#3135](https://github.com/github/copilot-cli/issues/3135), which records that the
level *was* being sent in 1.0.41.

Until it is fixed, set the level per model and the router applies it:

```json
{ "model": "deepseek-reasoner", "reasoningEffort": "high" }
```

`reasoningEffort` also works at provider level as a default. Values are the ones
Copilot uses: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

**Levels differ per model and providers do not fall back.** GLM-5.2 accepts `max`
but answers `400` to `xhigh`; an unsupported level would otherwise break every
request to that model. The router steps down one level at a time until one is
accepted, records it, and remembers it for the session:

```
notice: chutes: zai-org/GLM-5.2-TEE rejected reasoning effort "xhigh", retrying with "high"
```

### Ready for the fix

Nothing here needs rewriting when the CLI starts forwarding the level again: the
router already prefers an incoming `reasoning_effort` over the configured one, so
your pick in the picker will simply take effect. The only step will be to turn the
selector on:

```json
{ "model": "deepseek-reasoner", "reasoningEffortPicker": true }
```

It ships off, because a selector that accepts a choice and changes nothing is
worse than no selector. `reasoningEffortLevels` narrows what it offers, for models
that do not take every level.

## Custom configuration

To use different models, an internal gateway, or a local runtime, write your own config:

- Linux/macOS: `~/.config/copilot-byok/providers.json`
- Windows: `%APPDATA%\copilot-byok\providers.json`
- or point `--config` / `COPILOT_BYOK_CONFIG` at any path

```json
{
  "$schema": "https://raw.githubusercontent.com/TheStreamCode/copilot-byok-switcher/main/schemas/providers.schema.json",
  "providers": [
    {
      "id": "ollama",
      "name": "Ollama",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "authRequired": false,
      "models": [
        { "model": "qwen3-coder:30b", "label": "Qwen3 Coder 30B (local)", "contextWindow": 262144, "maxOutputTokens": 32768 }
      ]
    }
  ]
}
```

A custom file replaces the built-in catalog. See [`examples/providers.example.json`](examples/providers.example.json) for a fuller sample, and use `--list-models` to discover what a provider offers.

**API keys are never written to the config** — only the names of the environment variables that hold them. Inline `apiKey` fields are rejected.

## Commands

```sh
copilot-byok                      # Copilot with your models in the picker
copilot-byok --list-providers     # which providers are active, and what unlocks the rest
copilot-byok --native             # stock Copilot, no router
copilot-byok --dry-run            # show what would start, then exit
copilot-byok -- <copilot args>    # pass anything through to Copilot

copilot-byok keys list            # where each provider's key comes from
copilot-byok keys set <provider>  # store a key (prompted, never echoed)
copilot-byok keys remove <id>     # delete a stored key
copilot-byok keys path            # print the key store location

copilot-byok extension install    # add the /byok command to Copilot
copilot-byok extension status
copilot-byok extension uninstall

copilot-byok shim install         # make plain `copilot` use the router
copilot-byok shim status          # which mechanism is actually in effect
copilot-byok shim uninstall
```

### Environment variables

Everything has a working default; these are for when you need to change one.

| Variable | Effect |
|---|---|
| `COPILOT_BIN` | Path to the real Copilot CLI, when it is not on `PATH` under that name |
| `COPILOT_BYOK_CONFIG` | Provider configuration file (same as `--config`) |
| `COPILOT_BYOK_UPSTREAM` | Force the Copilot API tier (same as `--upstream`) |
| `COPILOT_BYOK_KEYSTORE` | Where stored keys live |
| `COPILOT_BYOK_MODEL_CACHE` | Where the last model list each key returned is kept |
| `COPILOT_BYOK_LOG` | Router log location |
| `COPILOT_BYOK_PROGRESS=off` | Turn off the startup progress line |
| `COPILOT_BYOK_ASCII=1` | ASCII spinner, for consoles that cannot render Braille |
| `COPILOT_BYOK_DEBUG=1` | Stream router events live instead of only to the log |
| `COPILOT_BYOK_PROVIDER_TIMEOUT_MS` | Idle timeout on a provider request (default 10 minutes) |

### Keeping the catalog honest

```sh
npm run catalog:update    # refresh models and limits from models.dev
npm run catalog:audit     # check every curated model still exists on its provider
```

The audit exits non-zero when a curated entry is not served by its provider.
Curated lists are only a fallback, but a wrong entry is worse than a missing one:
it is offered in the picker and fails only when selected.

### Single-provider mode

The original behaviour is still available with `--legacy`: it sets `COPILOT_PROVIDER_*` for one provider and runs Copilot against it, without the router. GitHub models are unavailable in that mode, which is exactly what you want for `--offline` work against a local model:

```sh
copilot-byok --legacy --provider ollama --model qwen3-coder --offline
```

## Security

The short version: no TLS is intercepted, no certificate authority is installed, the router listens on loopback only and exits with the session, provider keys never reach Copilot or GitHub, and your GitHub token passes through the router unlogged because it has to.

[SECURITY.md](SECURITY.md) covers the full model, including what the undocumented `COPILOT_API_URL` dependency means for you.

## Requirements

- Node.js 22.13 or newer
- GitHub Copilot CLI 1.0.79 or newer, available as `copilot` on `PATH` (set `COPILOT_BIN` to override)
- A GitHub Copilot account — any plan, including free

## Troubleshooting

Diagnostics go to `~/.config/copilot-byok/router.log`
(`%APPDATA%\copilot-byok
outer.log` on Windows) instead of the screen, which
Copilot's interface owns while it runs. If anything failed, a single line after
the session tells you how many errors there were and where to read them.

| Symptom | Cause |
|---|---|
| No BYOK models in `/model` | No provider active — run `copilot-byok --list-providers` |
| `Unknown BYOK model` | Catalog changed since the session started; restart `copilot-byok` |
| Provider returns 401 | Wrong or expired key for that provider, not for GitHub |
| Everything is a GitHub model again | Check whether `COPILOT_API_URL` still works on your CLI version |

More in [docs/troubleshooting.md](docs/troubleshooting.md).

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run check` (lint + tests) before opening one.

## License

This project is licensed under the [MIT License](LICENSE).
