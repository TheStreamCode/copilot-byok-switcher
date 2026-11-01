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

`apiKeyCommand` is the exception to environment variables: it names a command the Copilot CLI runs
itself to obtain a rotating credential, passed through as `COPILOT_PROVIDER_API_KEY_COMMAND` in
legacy mode. It needs Copilot CLI 1.0.84 or newer and works only with `--legacy`: the CLI's
`providers.json` registry has no equivalent, so router and `--native-byok` sessions cannot use it.
`headers` adds gateway headers to the provider requests, and to the native registry in
`--native-byok` mode.

## Commands

```sh
copilot-byok                      # Copilot with your models in the picker
copilot-byok --list-providers     # which providers are active, and what unlocks the rest
copilot-byok doctor               # diagnose the installation without starting Copilot
copilot-byok models [provider]    # what each provider serves right now
copilot-byok --native-byok        # supported BYOK registry instead of the local router
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

`doctor` exits non-zero only when a check fails; `models` accepts `--json` and `--offline` and
prints what discovery found without opening a session.

## Native registry mode

`--native-byok` publishes models through the CLI's own `providers.json` registry instead of the
local router. The session starts with `COPILOT_PROVIDERS_CONFIG` pointing at a temporary file
generated from the same live discovery; the file is removed when Copilot exits.

Use it when you want the supported BYOK path, or when `COPILOT_API_URL` stops working. Model ids in
`/model` are `provider/model`, for example `openai/gpt-5.5`; passing a picker id from this project
(`--model byok-openai-gpt-5-5`) still works because it is translated before launch.

Requirements and trade-offs:

- a Copilot CLI that reads `providers.json` (verified on 1.0.105; 1.0.79 does not);
- provider keys are written to that temporary file for the session, unlike router mode where they
  never reach the Copilot process. The directory and file are owner-only before the file is written;
  if that restriction fails the session is aborted rather than leaving keys readable. The registry is
  removed on normal exit and on SIGINT/SIGTERM/SIGHUP, and stale registries older than a week are
  swept at the next native startup for the uncatchable cases (SIGKILL, power loss);
- the router's reasoning-effort step-down does not apply because the CLI talks to the provider
  directly; the levels a model advertises are what the picker offers;
- a `~/.copilot/providers.json` you maintain yourself is ignored for that session, since the
  generated file replaces it.

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
| `COPILOT_GH_HOST`, `GH_HOST` | Data residency tenant host; the router derives `copilot-api.<tenant>.ghe.com` from it | Public GitHub hosts |

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

If `~/.copilot/providers.json` (or the file named by `COPILOT_PROVIDERS_CONFIG`) contains providers
or models, the CLI ignores `COPILOT_PROVIDER_*`. Legacy mode detects that case, points the child at
an empty temporary registry, and says so on stderr, so the mode keeps its documented meaning.

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

Current Copilot CLIs forward the level you pick to BYOK providers. Verified on 1.0.105, both through
the router and with the CLI's own provider variables. This was not true on 1.0.79, where the payloads
with `low` and with `high` were byte-identical: that was the CLI bug tracked in
[copilot-cli#4012](https://github.com/github/copilot-cli/issues/4012), resolved upstream.

The effort selector is therefore declared for models that report reasoning support, and can be
hidden per model or per provider with `reasoningEffortPicker: false`.

You can still force a level from the config in **router mode**, useful on older CLIs or when a model
should always run at a fixed effort:

```json
{ "model": "deepseek-reasoner", "reasoningEffort": "high" }
```

`reasoningEffort` also works at provider level as a default. Values are the ones Copilot uses:
`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. `reasoningEffortLevels` narrows what
the picker offers for a model. `--native-byok` ignores `reasoningEffort`: the CLI sends the level
from the picker or `--reasoning-effort`, and only `reasoningEffortLevels` constrains it there.

**Levels differ per model and providers do not fall back.** GLM-5.2 accepts `max` but answers `400`
to `xhigh`. In router mode the router steps down one level at a time, applies the same ladder to a
level the CLI sent, records the rejection for the session, and logs the adjustment. A `400` that
does not mention the effort is forwarded unchanged, so an ordinary context or schema error is never
retried through the ladder:

```text
notice: chutes: zai-org/GLM-5.2-TEE rejected reasoning effort "xhigh", retrying with "high"
```

In `--native-byok` mode there is no router in the path: the CLI's request reaches the provider
unchanged, so advertise only levels the model accepts, with `reasoningEffortLevels`.
