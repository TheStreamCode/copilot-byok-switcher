# Troubleshooting

## Copilot CLI is not found

Install GitHub Copilot CLI and confirm that the standalone executable is available:

```sh
copilot --version
```

If it uses a custom name or path, set `COPILOT_BIN` before launching the switcher:

```sh
COPILOT_BIN=/path/to/copilot copilot-byok --native
```

PowerShell:

```powershell
$env:COPILOT_BIN = 'C:\path\to\copilot.exe'
copilot-byok --native
```

## A provider credential is unavailable

Set the environment variable documented for the selected provider in the [provider table](../README.md#built-in-providers), then start a new command from the same shell. Do not put credentials in `providers.json` or pass them as command-line arguments.

Use `copilot-byok --provider <id> --dry-run` to inspect the resolved configuration. Secret values remain redacted.

## Ollama is unavailable or returns no models

Confirm that Ollama is running and that at least one compatible text model is installed:

```sh
ollama list
ollama serve
```

Then select an installed model explicitly:

```sh
copilot-byok --provider ollama --model <model>
```

## The model catalog times out

Catalog requests time out after 10 seconds by default. Confirm that the provider endpoint is reachable. Custom providers can increase `modelsTimeoutMs` up to `300000`; keep the timeout bounded and avoid disabling it.

If a provider does not expose a usable catalog, configure `defaultModel` or pass `--model` explicitly.

## Copilot reports an unsupported model or feature

The provider wire model and Copilot catalog model serve different purposes. Keep the provider's model name in `defaultModel` or `--model`, and use a Copilot-recognized `catalogModelId` for internal capabilities. See [Why `catalogModelId` and the wire model are separate](../README.md#why-catalogmodelid-and-the-wire-model-are-separate).

Use `--wire-api responses` only when the selected provider and model officially support the Responses API. Otherwise keep the provider's default wire API.

## More help

Search the [existing issues](https://github.com/TheStreamCode/copilot-byok-switcher/issues) before opening a bug report. Include the operating system, Node.js version, Copilot CLI version, provider id, sanitized command, and full error message. Never include API keys or tokens.
