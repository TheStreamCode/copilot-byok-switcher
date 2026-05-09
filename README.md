# copilot-byok-switcher

Cross-platform launcher for GitHub Copilot CLI custom model providers (BYOK), with interactive selection and automatic model defaults.

Created by [Michael Gasperini](https://mikesoft.it).

It lets you run GitHub Copilot CLI through native Copilot or a configurable OpenAI/Anthropic-compatible provider without permanently changing your shell environment.

## Features

- Works on Windows, macOS, and Linux with one Node.js CLI.
- Supports GitHub Copilot CLI native mode and BYOK providers.
- Keeps provider API keys in environment variables, not in generated shell profiles.
- Separates Copilot's built-in `MODEL_ID` from the provider `WIRE_MODEL` to avoid catalog warnings.
- Ranks provider models automatically using recency, tool support, model family, version, and context length.
- Passes BYOK variables only to the child Copilot process.
- Uses a generic provider config, so any OpenAI-compatible or Anthropic-compatible provider can be added.

## Requirements

- Node.js 20 or newer.
- GitHub Copilot CLI installed and available as `copilot` on `PATH`.

If your Copilot binary is not named `copilot`, set:

```sh
COPILOT_BIN=/path/to/copilot
```

## Installation

Install globally from GitHub:

```sh
npm install -g github:TheStreamCode/copilot-byok-switcher
```

Then verify the CLI is available:

```sh
copilot-byok --help
```

For local development, clone the repository and link the CLI:

```sh
git clone https://github.com/TheStreamCode/copilot-byok-switcher.git
cd copilot-byok-switcher
npm link
copilot-byok --help
```

## Quick Start

Run directly from the repository:

```sh
node bin/copilot-byok.mjs --help
```

Link locally for development:

```sh
npm link
copilot-byok --help
```

Run native GitHub Copilot CLI:

```sh
copilot-byok --native
```

Run a BYOK provider:

```sh
copilot-byok --provider chutes --no-model-prompt
copilot-byok --provider deepseek --no-model-prompt
copilot-byok --provider zai --no-model-prompt
copilot-byok --provider minimax --no-model-prompt
```

Pass a prompt to Copilot CLI:

```sh
copilot-byok --provider chutes --no-model-prompt -p "Explain this repository"
```

Use an explicit provider model:

```sh
copilot-byok --provider chutes --model moonshotai/Kimi-K2.6-TEE -p "Reply exactly: OK"
```

List ranked models:

```sh
copilot-byok --provider chutes --list-models
copilot-byok --provider opencode-go --list-models
copilot-byok --provider fireworks --list-models
copilot-byok --provider deepseek --list-models
copilot-byok --provider zai --list-models
copilot-byok --provider minimax --list-models
```

## Built-In Providers

The CLI includes defaults for:

- `chutes`
- `opencode-go` aliases: `go`, `opencode`
- `fireworks` aliases: `fire`, `fireworks-ai`
- `deepseek` alias: `deepseek-ai`
- `zai` aliases: `z-ai`, `glm`
- `minimax` alias: `minimax-ai`

API keys are read from environment variables. For example:

```sh
export CHUTES_API_KEY=...
export OPENCODE_GO_API_KEY=...
export FIREWORKS_API_KEY=...
export DEEPSEEK_API_KEY=...
export ZAI_API_KEY=...
export MINIMAX_API_KEY=...
```

PowerShell:

```powershell
$env:CHUTES_API_KEY = "..."
$env:OPENCODE_GO_API_KEY = "..."
$env:FIREWORKS_API_KEY = "..."
$env:DEEPSEEK_API_KEY = "..."
$env:ZAI_API_KEY = "..."
$env:MINIMAX_API_KEY = "..."
```

Built-in provider defaults are based on the public provider documentation:

| Provider | Base URL | Default model |
|---|---|---|
| DeepSeek AI | `https://api.deepseek.com` | `deepseek-v4-pro` |
| Z.ai | `https://api.z.ai/api/coding/paas/v4` | `glm-4.7` |
| MiniMax | `https://api.minimax.io/v1` | `MiniMax-M2.7` |

## Custom Provider Config

By default, the CLI looks for:

- Windows: `%APPDATA%\copilot-byok-switcher\providers.json`
- macOS/Linux: `~/.config/copilot-byok-switcher/providers.json`

You can also pass a file explicitly:

```sh
copilot-byok --config ./providers.json --provider my-provider
```

Example:

```json
{
  "providers": [
    {
      "id": "my-provider",
      "name": "My Provider",
      "type": "openai",
      "baseUrl": "https://api.example.com/v1",
      "apiKeyEnv": "MY_PROVIDER_API_KEY",
      "modelsUrl": "https://api.example.com/v1/models",
      "catalogModelId": "gpt-4.1",
      "requireToolSupport": true
    }
  ]
}
```

## Why `catalogModelId` And Wire Model Are Separate

GitHub Copilot CLI BYOK supports these variables:

```text
COPILOT_PROVIDER_MODEL_ID
COPILOT_PROVIDER_WIRE_MODEL
```

`COPILOT_PROVIDER_MODEL_ID` should be a model known by Copilot's built-in catalog, such as `gpt-4.1` or `claude-sonnet-4.6`. Copilot uses it for tool support, prompting strategy, and token defaults.

`COPILOT_PROVIDER_WIRE_MODEL` is the model name sent to your provider, such as `moonshotai/Kimi-K2.6-TEE` or `accounts/fireworks/models/minimax-m2p5`.

This avoids warnings like:

```text
Model "custom-provider-model" is not in the built-in catalog.
```

It also avoids GPT-5-specific warnings for providers that only support chat completions.

## Model Ranking

When no `--model` is provided, the CLI fetches the provider model catalog and ranks models with these rules:

- Exclude non-chat/non-agent model names such as image, embedding, rerank, OCR, guard, TTS, Whisper, audio, and diffusion models.
- Require text input when the provider exposes modality metadata.
- Require tool support when the provider exposes tool metadata and `requireToolSupport` is enabled.
- Require serverless/ready/OK state when the provider exposes those fields.
- Prefer newer `updateTime`, then newer `createTime` or `created`.
- Prefer coding/agent model families as a tie-break: MiniMax, Kimi/Moonshot, DeepSeek, Qwen, GLM/Z.ai, GPT, Mistral.
- Prefer higher semantic version in the model name, such as `m2.7` over `m2.5`.
- Prefer larger context length when available.
- Use model name as the final deterministic tie-break.

## Provider Fields

| Field | Required | Description |
|---|---:|---|
| `id` | yes | Provider id used by `--provider`. |
| `name` | yes | Display name. |
| `type` | yes | Copilot BYOK provider type: `openai`, `anthropic`, or `azure`. |
| `baseUrl` | yes | BYOK provider base URL. |
| `apiKeyEnv` | no | Env var name or list of names for API key lookup. |
| `bearerTokenEnv` | no | Env var name or list for bearer token lookup. |
| `modelsUrl` | no | URL used to fetch model catalog. |
| `catalogModelId` | no | Built-in Copilot model id for internal capabilities. |
| `defaultModel` | no | Fallback model when catalog fetch fails. |
| `wireApi` | no | Optional BYOK wire API, such as `responses`. |
| `maxPromptTokens` | no | Manual prompt token limit. |
| `maxOutputTokens` | no | Manual output token limit. |
| `requireToolSupport` | no | Exclude models without tool support metadata. |

## Safety

- API keys are read from environment variables.
- Provider config files cannot contain inline API keys or bearer tokens.
- Dry-run output redacts secret env values.
- Stale `COPILOT_PROVIDER_*` variables are stripped before launching Copilot.
- BYOK environment variables are passed only to the child Copilot process.
- The tool does not write tokens to disk.

## Development

Run tests:

```sh
npm test
```

Run a dry-run:

```sh
copilot-byok --provider chutes --no-model-prompt --dry-run -p "hello"
```
