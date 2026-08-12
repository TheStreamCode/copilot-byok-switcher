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

## Inspecting what the router does

```sh
COPILOT_BYOK_DEBUG=1 copilot-byok
```

Each forwarded request prints the provider and the real model name. Credentials
are never logged.

## A corporate proxy is in the way

The router opens its own HTTPS connection to GitHub, so it honours the usual
`HTTPS_PROXY` and `NO_PROXY` variables of the Node.js process. Make sure
`127.0.0.1` is in `NO_PROXY` so Copilot's own traffic to the router is not sent
through the proxy.
