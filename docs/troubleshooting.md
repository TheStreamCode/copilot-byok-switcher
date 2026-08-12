# Troubleshooting

## No BYOK models appear in `/model`

Check which providers are active:

```sh
copilot-byok --list-providers
```

A provider activates only when one of its environment variables holds a key. If
the list shows everything as inactive, the switcher starts Copilot with GitHub
models only and says so on stderr.

Remember that variables set in one shell do not reach another: export the key and
start `copilot-byok` from the same session.

## The models were there, now they are gone

The router relies on `COPILOT_API_URL`, an internal Copilot CLI variable that is
not part of its documented interface. A CLI update can rename it or change how it
behaves. To confirm that is the cause:

```sh
copilot-byok --dry-run     # should print a router URL and the model ids
copilot --version          # note the version that broke it
```

Please open an issue with that version number. Meanwhile `copilot-byok --native`
runs a stock session, and `--legacy` still gives you one BYOK provider through the
officially documented `COPILOT_PROVIDER_*` variables.

## `Unknown BYOK model`

The catalog changed while a session was running — for example after editing your
config or running `npm run catalog:update`. Restart `copilot-byok`; Copilot may
also have remembered the old id as your default, in which case pick a model from
`/model` again.

## A provider returns 401 or 403

That status comes from the provider, not from GitHub: the key for that specific
provider is missing, wrong or expired. GitHub authentication is separate and
unaffected — the same session can still use GitHub models.

Check which variable the switcher is reading with `copilot-byok --list-providers`.

## A provider returns 404 on a model

The model name in your config does not exist upstream. Names drift; list what the
provider actually offers:

```sh
copilot-byok --legacy --provider <id> --list-models
```

Then update `models` in your config, or run `npm run catalog:update` if you use
the built-in catalog.

## The agent starts but fails mid-task

Almost always a capability mismatch: the model does not really support tool
calling, and the harness discovers it once it tries to use a tool. The generated
catalog only publishes models that report tool support, but a hand-written config
entry can claim anything. Verify the model supports function calling and
streaming before adding it.

## Copilot CLI is not found

```sh
copilot --version
```

If the executable has another name or path:

```sh
COPILOT_BIN=/path/to/copilot copilot-byok
```

PowerShell:

```powershell
$env:COPILOT_BIN = 'C:\path\to\copilot.exe'
copilot-byok
```

The launcher already prefers a working standalone CLI over the known stale VS Code
shim.

## Business or Enterprise account

The router detects the right Copilot API tier automatically by probing the
individual, business and enterprise hosts in order. To skip detection:

```sh
copilot-byok --upstream https://api.business.githubcopilot.com
```

or set `COPILOT_BYOK_UPSTREAM`. Note that Copilot Enterprise owners can add custom
models natively from enterprise settings, which shows them in the picker without
this tool.

## Ollama or LM Studio returns nothing

Both ship disabled in the catalog because they have no keys to detect. Add them in
your own config with the models you have pulled locally, and make sure the server
is running:

```sh
curl http://127.0.0.1:11434/v1/models    # Ollama
curl http://127.0.0.1:1234/v1/models     # LM Studio
```

## A request hangs

The router gives up on a provider that accepts the connection and then sends
nothing for ten minutes, answering `502` with `no data for 600s`. Reasoning models
can legitimately think for minutes, which is why the limit is generous. Adjust it
with `COPILOT_BYOK_PROVIDER_TIMEOUT_MS` if your provider is slower, or lower it to
fail faster.

## Inspecting what the router does

The router writes what it did to a log rather than to the screen, because Copilot
draws a full-screen interface and anything printed over it garbles the display.
If something went wrong you get one line after Copilot exits:

```
copilot-byok: 3 router errors during this session — see ~/.config/copilot-byok/router.log
```

The log records forwarded requests, model injections and errors, with a timestamp
and the process id. Credentials are never written to it. On Windows it lives in
`%APPDATA%\copilot-byokouter.log`; `COPILOT_BYOK_LOG` overrides the path, and
the file is truncated once it passes 2 MB.

To watch events live instead — accepting that the display will be disturbed:

```sh
COPILOT_BYOK_DEBUG=1 copilot-byok
```

## A corporate proxy is in the way

The router opens its own HTTPS connection to GitHub, so it honours the usual
`HTTPS_PROXY` and `NO_PROXY` variables of the Node.js process. Make sure
`127.0.0.1` is in `NO_PROXY` so Copilot's own traffic to the router is not sent
through the proxy.
