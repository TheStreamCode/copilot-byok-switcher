# Troubleshooting

## `copilot` starts, but without the BYOK models

Plain `copilot` is GitHub's CLI and knows nothing about your providers. Either run
`copilot-byok`, or install the shim so the short name goes through the router:

```sh
copilot-byok shim install
copilot-byok shim status     # confirms the directory is really on PATH
```

A startup line reading `copilot-byok: added N models from N providers` is the
quickest way to tell which one you are in.

If `copilot` still runs the original CLI after installing the shim, check
`copilot-byok shim status`. On Windows the system PATH is searched before the user
one, so a CLI installed machine-wide always wins over a shim in a user directory,
whatever you add to your own PATH. The shell function installed alongside it is
what takes precedence; it needs a new terminal to be picked up, and PowerShell 5.1
and PowerShell 7 read different profile files.

## No BYOK models appear in `/model`

**If the startup line says `still waiting on extensions`**, an extension is
holding up the session: Copilot asks for approval before loading one that
requests elevated permissions, and until that prompt is answered the model list
never arrives, so the picker comes up empty. Answer the prompt, or start with
`--allow-all-tools` to approve it up front.

`/byok` itself asks for no elevated permissions, so it does not cause this. If you
wrote your own extension and hit it, check whether it declares
`onPermissionRequest`: that alone is what triggers the request.

Then check which providers are active:

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

## A model I expected is missing from the picker

The list comes from the provider itself. Three things can hide a model:

- **It cannot call tools.** Models whose metadata says so are excluded on purpose;
  an agent that cannot use tools fails mid-session rather than at startup.
- **The per-provider cap.** At most twelve models per provider reach the picker,
  chosen by the same ranking used elsewhere. Raise it with `maxDiscoveredModels`
  in your config, or pin the exact models you want under `models`.
- **Discovery fell back.** If the provider was unreachable or rejected the key,
  the list it returned last time is used; failing that, the shipped one. The log
  says which and why. A shipped list is generic, so it may name models your plan
  does not include — if you see one that should not be there, that is the sign.

Results are cached for ten minutes, so a model added upstream may take that long
to appear — restart to pick it up immediately.

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

## Setting the reasoning effort has no effect

Copilot's `--effort` flag and its effort selector do not reach BYOK providers —
the level never leaves the CLI. Set it per model instead:

```json
{ "model": "deepseek-reasoner", "reasoningEffort": "high" }
```

If a model rejects that level the router steps down automatically and says so in
the log, so a wrong value degrades rather than breaking every request.

The selector is missing from `/model` on purpose: on CLI 1.0.79 the level it
returns never reaches the provider (github/copilot-cli#4012). Enable it with
`reasoningEffortPicker: true` once that is fixed — the router already honours an
incoming level, so nothing else needs changing.

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
`%APPDATA%\copilot-byok
outer.log`; `COPILOT_BYOK_LOG` overrides the path, and
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
