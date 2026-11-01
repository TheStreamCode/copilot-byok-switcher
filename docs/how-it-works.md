# How it works

## What you get

Start Copilot the way you always do, open `/model`, and find your own models listed next to
GitHub's:

```text
Recommended models
> Auto
New models
  Claude Sonnet 4.6 (Anthropic)      (your Anthropic key)
  GPT-5.5 (OpenAI)                   (your OpenAI key)
  DeepSeek V4 Pro (DeepSeek)         (your DeepSeek key)
  GLM-5.2 (Z.AI GLM)                 (your Z.AI key)
  Qwen3 Coder Plus (Alibaba Qwen)    (your DashScope key)
Unavailable models
  claude-sonnet-5
  ...
```

Pick one and the session talks straight to that provider. GitHub authentication stays intact,
every other Copilot feature keeps working, and those turns cost zero AI credits — you pay your
provider directly. The list is not hard-coded: each provider is asked what it serves at startup,
so a model released this morning is in the picker this morning. The switch is announced in the
session:

```text
Model changed to: byok-anthropic-claude-sonnet-4-6 for this session
```

## Why this exists

Copilot CLI has two built-in ways to use your own models.

The `COPILOT_PROVIDER_*` variables point the whole session at one provider. That path still has the
limits this project was built for: one provider per session, no provider list in `/model`, GitHub
models unavailable.

The `providers.json` registry is the better supported path: multiple providers and models, listed
in `/model` next to GitHub's, with the CLI talking to each provider itself. It still asks you to
write every endpoint and model by hand, stores the keys as plain text in that file, and needs a
restart after edits. Ollama is the exception: the CLI discovers local Ollama models on its own.

This project sits on top of both: it asks each provider what it serves now, ships endpoints for 28
of them, keeps credentials in environment variables or the opt-in key store, and can feed the
native registry from the same discovery. The default mode remains the local router, which was
verified to keep working on CLI 1.0.105 and supports older CLIs as well.

| | `COPILOT_PROVIDER_*` | `providers.json` | This project |
| --- | --- | --- | --- |
| Providers per session | one | as many as configured | as many as configured |
| `/model` picker | one fixed model | your models next to GitHub's | your models next to GitHub's |
| GitHub models | unavailable | available | available |
| Model lists | you write them | you write them (Ollama is discovered) | discovered from each provider |
| Credentials | environment | plain text in the file | environment or key store |
| Local proxy | no | no | router mode only |
| Works on older CLIs | yes | newer releases only | yes, via the router |

## The router

Copilot CLI reads an environment variable, `COPILOT_API_URL`, that repoints its API endpoint
anywhere — including plain HTTP on localhost. The switcher starts a small local router there:

```text
copilot --COPILOT_API_URL--> router --+--> api.<tier>.githubcopilot.com   (everything else, untouched)
                                      +--> your providers (OpenAI-compatible)
```

The router does exactly three things:

1. **`GET /models`** — takes GitHub's list and appends your models, so the picker shows them.
2. **`POST` with one of your models** — recognises the `byok-*` id, maps it back to the provider's
   real model name, forwards it, and streams the response through untouched.
3. **Everything else** — passes to GitHub byte for byte.

There is no TLS interception: Copilot talks in the clear to `127.0.0.1`, and the router opens its
own ordinary HTTPS connection to GitHub. The router listens on an ephemeral port bound to
loopback and shuts down when Copilot exits.

> [!IMPORTANT]
> `COPILOT_API_URL` is an internal variable — it is not listed in `copilot help environment`. It
> worked on CLI 1.0.79 and still worked on 1.0.105 when this project was re-verified on 2026-11-01,
> but GitHub may rename or change it. If your models ever vanish from the picker, that is the first
> thing to check, `copilot-byok doctor` reports the CLI version it found, and `copilot-byok
> --native` always gets you back to a stock session.

## Native registry mode

`copilot-byok --native-byok` publishes the same models through the CLI's supported BYOK registry
instead of the router. It runs the usual live discovery, writes a temporary `providers.json`, points
`COPILOT_PROVIDERS_CONFIG` at it, starts Copilot, and deletes the file when the session ends. There
is no local proxy and no dependency on `COPILOT_API_URL`.

The trade-off is the one the registry itself imposes: provider keys are in that temporary file while
the session runs. The directory and file are owner-only before the file is written; if the
restriction cannot be applied the session is aborted. The file is removed on normal exit, when the
session fails to start, and on SIGINT/SIGTERM/SIGHUP; registries left by a hard kill are swept when
the next native session starts. Model ids are `provider/model`; a `--model byok-...` value is
translated to the matching native id.
