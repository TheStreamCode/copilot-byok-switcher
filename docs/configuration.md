# Configuration and commands

## Custom provider configuration

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

A custom file replaces the built-in catalog. See
[`examples/providers.example.json`](../examples/providers.example.json) for a fuller sample, and
use `--list-models` to discover what a provider offers.

**API keys are never written to the config** — only the names of the environment variables that
hold them. Inline `apiKey` fields are rejected.

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

## Environment variables

Everything has a working default; these are for when you need to change one.

| Variable | Effect | Default |
| --- | --- | --- |
| `COPILOT_BIN` | Path to the real Copilot CLI, when it is not on `PATH` under that name | `copilot` from `PATH` |
| `COPILOT_BYOK_CONFIG` | Provider configuration file (same as `--config`) | Built-in catalog |
| `COPILOT_BYOK_UPSTREAM` | Force the Copilot API tier (same as `--upstream`) | Resolved at startup |
| `COPILOT_BYOK_KEYSTORE` | Where stored keys live | Platform config directory |
| `COPILOT_BYOK_MODEL_CACHE` | Where the last model list each key returned is kept | Platform cache directory |
| `COPILOT_BYOK_LOG` | Router log location | Platform config directory |
| `COPILOT_BYOK_PROGRESS=off` | Turn off the startup progress line | Progress line on |
| `COPILOT_BYOK_ASCII=1` | ASCII spinner, for consoles that cannot render Braille | Unicode progress |
| `COPILOT_BYOK_DEBUG=1` | Stream router events live instead of only to the log | Events go to the log only |
| `COPILOT_BYOK_PROVIDER_TIMEOUT_MS` | Idle timeout on a provider request | 10 minutes |

## Keeping the catalog honest

```sh
npm run catalog:update    # regenerate the endpoint catalog from scripts/catalog-sources.json
npm run catalog:audit     # check every provider serves a usable model list
```

The audit queries each provider's live catalog and exits non-zero when one that answers yields no
usable chat model. Providers that need a key you have not configured are reported as unverifiable
rather than failing.

## Single-provider mode

The original behaviour is still available with `--legacy`: it sets `COPILOT_PROVIDER_*` for one
provider and runs Copilot against it, without the router. GitHub models are unavailable in that
mode, which is exactly what you want for `--offline` work against a local model:

```sh
copilot-byok --legacy --provider ollama --model qwen3-coder --offline
```

## The shim

`copilot-byok shim install` makes plain `copilot` use the router. It does two things, because on
many machines one is not enough:

- writes a small `copilot` into `~/.local/share/copilot-byok/bin`
  (`%APPDATA%\copilot-byok\bin` on Windows, plus a `.cmd`), and
- adds a `copilot` function to your shell profiles.

The function is what makes it work when another `copilot` sits earlier on PATH. On Windows that is
the normal case: the **system** PATH is searched before the user one, so a CLI installed
machine-wide beats anything you can add for your own user — a shim alone would never be reached. A
shell function takes precedence over PATH entirely, in PowerShell and in POSIX shells alike.

Both mechanisms hand the real CLI's path to the launcher through `COPILOT_BIN`, which is what stops
it resolving the shim and calling itself. `copilot-vanilla` runs the original CLI, and
`copilot-byok shim uninstall` removes everything it wrote — the profile block is delimited by
markers, so the rest of your profile is never touched.

Open a **new** terminal afterwards. PowerShell 5.1 and PowerShell 7 read different profile files;
both are handled. `copilot-byok shim status` says which mechanism is actually in effect.

## Reasoning effort

Copilot's own `--effort` flag and its effort selector do not reach BYOK providers. Verified against
a provider that records what it receives: the payloads produced with `low` and with `high` are
byte-identical, in both wire formats. This is a known CLI bug rather than a limitation of BYOK
itself — see [copilot-cli#4012](https://github.com/github/copilot-cli/issues/4012) (still open,
same symptom on GLM-5.2), [#3119](https://github.com/github/copilot-cli/issues/3119) and
[#3135](https://github.com/github/copilot-cli/issues/3135), which records that the level *was*
being sent in 1.0.41.

Until it is fixed, set the level per model and the router applies it:

```json
{ "model": "deepseek-reasoner", "reasoningEffort": "high" }
```

`reasoningEffort` also works at provider level as a default. Values are the ones Copilot uses:
`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

**Levels differ per model and providers do not fall back.** GLM-5.2 accepts `max` but answers `400`
to `xhigh`; an unsupported level would otherwise break every request to that model. The router
steps down one level at a time until one is accepted, records it, and remembers it for the session:

```text
notice: chutes: zai-org/GLM-5.2-TEE rejected reasoning effort "xhigh", retrying with "high"
```

### Ready for the fix

Nothing here needs rewriting when the CLI starts forwarding the level again: the router already
prefers an incoming `reasoning_effort` over the configured one, so your pick in the picker will
simply take effect. The only step will be to turn the selector on:

```json
{ "model": "deepseek-reasoner", "reasoningEffortPicker": true }
```

It ships off, because a selector that accepts a choice and changes nothing is worse than no
selector. `reasoningEffortLevels` narrows what it offers, for models that do not take every level.
