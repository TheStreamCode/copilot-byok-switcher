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

Copilot CLI does support BYOK out of the box, through `COPILOT_PROVIDER_BASE_URL`. That path has
three limits this project removes:

| | Built-in BYOK | Copilot BYOK Switcher |
| --- | --- | --- |
| Providers per session | one | as many as you configure |
| `/model` picker | shows nothing to choose from | your models listed with GitHub's |
| GitHub models | unavailable while BYOK is on | still there, same session |
| Switching model | restart with new env vars | `/model` inside the session |

Bringing your **own key** for OpenAI, Anthropic or Gemini is not possible natively on personal
accounts at all — GitHub reserves that for enterprise owners, who get custom models in the
picker. On a personal plan those vendors appear in the picker but are served by GitHub's own
subscription: they consume premium requests and follow your plan's restrictions. On the free plan
most of them are visible yet unusable.

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
> works today (verified on CLI 1.0.79) but GitHub may rename or change it. If your models ever
> vanish from the picker, that is the first thing to check, and `copilot-byok --native` always
> gets you back to a stock session.
