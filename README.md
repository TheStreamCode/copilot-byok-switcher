# copilot-byok-switcher

Cross-platform launcher for GitHub Copilot CLI custom model providers (BYOK), with interactive selection and automatic model defaults.

Created by [Michael Gasperini](https://mikesoft.it).

It lets you run GitHub Copilot CLI through native Copilot or a configurable OpenAI/Anthropic-compatible provider without permanently changing your shell environment.

## Features

- Works on Windows, macOS, and Linux with one Node.js CLI.
- Supports GitHub Copilot CLI native mode and BYOK providers.
- Keeps provider API keys in environment variables, not in generated shell profiles.
- Separates Copilot's required catalog model (`COPILOT_MODEL`) from the provider wire model.
- Ranks provider models automatically using recency, tool support, model family, version, and context length.
- Passes BYOK variables only to the child Copilot process.
- Avoids the stale VS Code Copilot shim when a working npm CLI is also available on `PATH`.
- Supports Copilot offline mode and both `completions` and `responses` wire APIs.
- Uses a generic provider config, so any OpenAI-compatible or Anthropic-compatible provider can be added.

## Requirements

- Node.js 22.13 or newer.
- GitHub Copilot CLI 1.0.20 or newer installed and available as `copilot` on `PATH`.

Use the latest stable Copilot CLI when possible. Version 1.0.64 or newer includes the most important BYOK Responses and WebSocket fixes recorded in the official [Copilot CLI changelog](https://github.com/github/copilot-cli/blob/main/changelog.md).

The launcher automatically prefers a working standalone CLI over the known stale VS Code shim. If your Copilot binary has another name or location, set:

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
copilot-byok --provider openrouter --no-model-prompt
copilot-byok --provider moonshot --no-model-prompt
copilot-byok --provider alibaba-token-plan --no-model-prompt
copilot-byok --provider tencent-token-plan --no-model-prompt
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
copilot-byok --provider openrouter --list-models
copilot-byok --provider moonshot --list-models
```

## Built-In Providers

The CLI includes defaults for Chutes, OpenCode Go, Fireworks AI, OpenRouter, Moonshot AI (Kimi), DeepSeek, Z.ai (GLM), MiniMax, Alibaba Model Studio Token Plan, and Tencent Cloud Token Plan.

API keys are read from environment variables. For example:

```sh
export CHUTES_API_KEY=...
export OPENCODE_GO_API_KEY=...
export FIREWORKS_API_KEY=...
export DEEPSEEK_API_KEY=...
export ZAI_API_KEY=...
export MINIMAX_API_KEY=...
export OPENROUTER_API_KEY=...
export MOONSHOT_API_KEY=...
export ALIBABA_TOKEN_PLAN_API_KEY=...
export TENCENT_TOKEN_PLAN_API_KEY=...
```

PowerShell:

```powershell
$env:CHUTES_API_KEY = "..."
$env:OPENCODE_GO_API_KEY = "..."
$env:FIREWORKS_API_KEY = "..."
$env:DEEPSEEK_API_KEY = "..."
$env:ZAI_API_KEY = "..."
$env:MINIMAX_API_KEY = "..."
$env:OPENROUTER_API_KEY = "..."
$env:MOONSHOT_API_KEY = "..."
$env:ALIBABA_TOKEN_PLAN_API_KEY = "..."
$env:TENCENT_TOKEN_PLAN_API_KEY = "..."
```

Every preset is based on the provider's official API documentation:

| Provider (id / aliases) | Protocol | Official endpoint | Default model | Documentation |
|---|---|---|---|---|
| Chutes (`chutes`) | OpenAI | `https://llm.chutes.ai/v1` | auto-ranked | [Chutes docs](https://chutes.ai/docs) |
| OpenCode Go (`opencode-go`, `go`, `opencode`) | Anthropic | `https://opencode.ai/zen/go` | auto-ranked | [OpenCode Go docs](https://opencode.ai/docs/go/) |
| Fireworks AI (`fireworks`, `fire`) | Anthropic | `https://api.fireworks.ai/inference` | auto-ranked | [Fireworks Anthropic compatibility](https://docs.fireworks.ai/tools-sdks/anthropic-compatibility) |
| OpenRouter (`openrouter`, `or`) | OpenAI | `https://openrouter.ai/api/v1` | `openrouter/auto` | [OpenRouter models API](https://openrouter.ai/docs/api/api-reference/models/get-models) |
| Moonshot AI (`moonshot`, `kimi`) | OpenAI | `https://api.moonshot.ai/v1` | `kimi-k3` | [Kimi models API](https://platform.kimi.ai/docs/api/list-models) |
| DeepSeek (`deepseek`) | OpenAI | `https://api.deepseek.com` | `deepseek-v4-pro` | [DeepSeek models API](https://api-docs.deepseek.com/api/list-models) |
| Z.ai (`zai`, `glm`) | OpenAI | `https://api.z.ai/api/coding/paas/v4` | `glm-5.1` | [Z.ai HTTP API](https://docs.z.ai/guides/develop/http/introduction) |
| MiniMax (`minimax`) | OpenAI | `https://api.minimax.io/v1` | `MiniMax-M2.7` | [MiniMax models API](https://platform.minimax.io/docs/api-reference/models/openai/list-models) |
| Alibaba Model Studio Token Plan (`alibaba-token-plan`, `qwen`) | OpenAI | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `qwen3.7-plus` | [Alibaba Token Plan quickstart](https://help.aliyun.com/en/model-studio/token-plan-personal-quick-start) |
| Tencent Cloud Token Plan (`tencent-token-plan`, `tokenhub`) | OpenAI | `https://api.lkeap.cloud.tencent.com/plan/v3` | `tc-code-latest` | [Tencent Token Plan quickstart](https://cloud.tencent.com/document/product/1823/130119) |

Provider-specific examples:

```sh
copilot-byok --provider deepseek --no-model-prompt -p "Explain this repository"
copilot-byok --provider zai --model glm-5.1 -p "Reply exactly: OK"
copilot-byok --provider minimax --model MiniMax-M2.7 -p "Summarize the latest diff"
copilot-byok --provider openrouter --offline --no-model-prompt
copilot-byok --provider kimi --model kimi-k3 -p "Review this diff"
copilot-byok --provider qwen --model qwen3.7-plus -p "Fix the failing tests"
copilot-byok --provider tokenhub --model tc-code-latest -p "Refactor this module"
```

Z.ai uses the Coding Plan endpoint by default because it is the endpoint documented for coding tools. If you need the general Z.ai API endpoint instead, create a custom provider with `baseUrl` set to `https://api.z.ai/api/paas/v4`.

The Alibaba preset is specifically for the Beijing Model Studio Token Plan and requires its dedicated plan key. The Tencent preset targets the mainland China personal Token Plan and requires its dedicated `sk-tp-...` key. Pay-as-you-go, enterprise, international, and other regions use different endpoints and should be configured as custom providers.

Gemini is intentionally not duplicated as a built-in BYOK preset because current Copilot CLI releases already expose Gemini through the [native Copilot model catalog](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference). A direct Google endpoint can still be added as a custom provider when separate Google billing and credentials are required.

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
  "$schema": "https://raw.githubusercontent.com/TheStreamCode/copilot-byok-switcher/main/schemas/providers.schema.json",
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

## Why `catalogModelId` and the wire model are separate

GitHub Copilot CLI BYOK supports these variables:

```text
COPILOT_MODEL
COPILOT_PROVIDER_WIRE_MODEL
```

`catalogModelId` sets the required `COPILOT_MODEL` value. It should be a model known by Copilot's built-in catalog, such as `gpt-4.1` or `claude-sonnet-4.6`; Copilot uses that catalog entry for internal capabilities and defaults.

`COPILOT_PROVIDER_WIRE_MODEL` is the model name sent to your provider, such as `moonshotai/Kimi-K2.6-TEE` or `accounts/fireworks/models/minimax-m2p5`.

This avoids warnings like:

```text
Model "custom-provider-model" is not in the built-in catalog.
```

It also avoids GPT-5-specific warnings for providers that only support chat completions.

See GitHub's official [Copilot CLI BYOK documentation](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models) for the underlying environment variables and compatibility requirements.

## Copilot CLI features

The switcher exposes current Copilot CLI BYOK capabilities without changing global shell state:

- `--offline` sets `COPILOT_OFFLINE=true`, preventing Copilot from connecting to GitHub while the selected provider remains reachable.
- `--wire-api completions|responses` overrides `COPILOT_PROVIDER_WIRE_API` for providers that implement the selected OpenAI wire API.
- `maxOutputTokens` is forwarded to Copilot and is honored by recent Responses-provider releases.
- Provider configuration also works when Copilot is used through ACP; that behavior is implemented by Copilot CLI itself.

Use `responses` only when the selected provider and model officially support it. Otherwise keep the default completions API.

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
| `id` | no | Provider id used by `--provider`; derived from `name` when omitted. |
| `name` | yes | Display name. |
| `aliases` | no | Additional unique names accepted by `--provider`. |
| `type` | yes | Copilot BYOK provider type: `openai`, `anthropic`, or `azure`. |
| `baseUrl` | yes | BYOK provider base URL. |
| `apiKeyEnv` | no | Env var name or list of names for API key lookup. |
| `bearerTokenEnv` | no | Env var name or list for bearer token lookup. |
| `modelsUrl` | no | URL used to fetch model catalog. |
| `modelsAuth` | no | Send the provider bearer token to a cross-origin catalog only when explicitly `true`; use `false` or `none` to disable catalog auth. |
| `modelsHeaders` | no | Non-secret string headers for model catalog requests. |
| `modelsTimeoutMs` | no | Catalog timeout from 10 to 300000 ms; defaults to 10000 ms. |
| `catalogModelId` | no | Built-in Copilot model id for internal capabilities. |
| `defaultModel` | no | Fallback model when catalog fetch fails. |
| `wireApi` | no | BYOK wire API: `completions` or `responses`. |
| `maxPromptTokens` | no | Manual prompt token limit. |
| `maxOutputTokens` | no | Manual output token limit. |
| `requireToolSupport` | no | Exclude models without tool support metadata. |

## Safety

- API keys are read from environment variables.
- Provider config files cannot contain inline API keys or bearer tokens.
- Dry-run output redacts secret env values.
- Stale `COPILOT_PROVIDER_*` variables are stripped before launching Copilot.
- Provider source-key variables are removed case-insensitively from the child environment.
- Catalog requests time out after 10 seconds by default.
- Credentials are sent automatically only to same-origin catalog URLs; cross-origin auth requires `modelsAuth: true`.
- BYOK environment variables are passed only to the child Copilot process.
- The tool does not write tokens to disk.

## Development

Run the complete local quality gate:

```sh
npm run check
npm run test:coverage
npm pack --dry-run
```

Run a dry-run:

```sh
copilot-byok --provider chutes --no-model-prompt --dry-run -p "hello"
```

See [Provider verification](docs/provider-verification.md) for the latest reproducible test matrix. It distinguishes endpoint reachability, authenticated catalog access, and complete Copilot CLI inference; these are intentionally not treated as equivalent claims.

## Support

If this CLI saves you time when testing Copilot BYOK providers, support continued maintenance through GitHub Sponsors: [github.com/sponsors/TheStreamCode](https://github.com/sponsors/TheStreamCode).

## Third-Party Notice

GitHub and GitHub Copilot are trademarks of GitHub, Inc. This project is not affiliated with or endorsed by GitHub.
