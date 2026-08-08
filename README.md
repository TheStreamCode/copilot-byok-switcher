# Copilot BYOK Switcher

[![npm version](https://img.shields.io/npm/v/copilot-byok-switcher)](https://www.npmjs.com/package/copilot-byok-switcher)
[![CI](https://github.com/TheStreamCode/copilot-byok-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/copilot-byok-switcher/actions/workflows/ci.yml)
[![node-current](https://img.shields.io/node/v/copilot-byok-switcher)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/copilot-byok-switcher)](LICENSE)

**Safely switch GitHub Copilot CLI between native mode and BYOK providers without storing credentials or modifying your shell profile.**

```sh
npm install -g copilot-byok-switcher
```

Created by [Michael Gasperini](https://mikesoft.it).

Use native Copilot, a built-in cloud provider, a local Ollama model, or any configurable OpenAI-, Anthropic-, or Azure-compatible endpoint.

## Quick Start

```sh
# Native GitHub Copilot CLI
copilot-byok --native

# Cloud BYOK provider (reads the provider key from its environment variable)
copilot-byok --provider openai --no-model-prompt

# Local Ollama model (no API key required)
copilot-byok --provider ollama --model qwen3-coder
```

Run `copilot-byok --help` for all options. See [Built-In Providers](#built-in-providers) for credential variables and officially documented endpoints.

## Why this exists

GitHub Copilot CLI supports custom model providers through `COPILOT_*` environment variables, but configuring them manually is repetitive and easy to get wrong. Copilot BYOK Switcher builds those variables only for the child Copilot process, keeps provider model names separate from Copilot's catalog model, and selects compatible defaults without changing the user's persistent environment.

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

Install the latest stable release from npm:

```sh
npm install -g copilot-byok-switcher
```

To pin an exact release explicitly:

```sh
npm install -g copilot-byok-switcher@0.3.0
```

The same version can be installed directly from its GitHub tag:

```sh
npm install -g github:TheStreamCode/copilot-byok-switcher#v0.3.0
```

Then verify the CLI is available:

```sh
copilot-byok --version
copilot-byok --help
```

See the [npm package](https://www.npmjs.com/package/copilot-byok-switcher) and
[GitHub releases](https://github.com/TheStreamCode/copilot-byok-switcher/releases)
for published versions and release notes.

For local development, clone the repository and link the CLI:

```sh
git clone https://github.com/TheStreamCode/copilot-byok-switcher.git
cd copilot-byok-switcher
npm link
copilot-byok --help
```

## Usage Examples

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
copilot-byok --provider openai --no-model-prompt
copilot-byok --provider anthropic --no-model-prompt
copilot-byok --provider ollama --model qwen3-coder
copilot-byok --provider chutes --no-model-prompt
copilot-byok --provider opencode-go-openai --no-model-prompt
copilot-byok --provider deepseek --no-model-prompt
copilot-byok --provider groq --no-model-prompt
copilot-byok --provider xai --no-model-prompt
copilot-byok --provider mistral --no-model-prompt
copilot-byok --provider zai --no-model-prompt
copilot-byok --provider zai-api --no-model-prompt
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
copilot-byok --provider openai --list-models
copilot-byok --provider anthropic --list-models
copilot-byok --provider ollama --list-models
copilot-byok --provider chutes --list-models
copilot-byok --provider opencode-go --list-models
copilot-byok --provider opencode-go-openai --list-models
copilot-byok --provider fireworks --list-models
copilot-byok --provider deepseek --list-models
copilot-byok --provider zai --list-models
copilot-byok --provider minimax --list-models
copilot-byok --provider openrouter --list-models
copilot-byok --provider moonshot --list-models
```

## Command-Line Options

| Option | Description |
|---|---|
| `-P`, `--provider <id>` | Provider id or alias. |
| `--native` | Run GitHub Copilot CLI without BYOK. |
| `-m`, `--model <model>` | Provider wire model for BYOK, native model for `--native`. |
| `-c`, `--config <path>` | Provider config JSON path. |
| `--list-models` | Print ranked models for the selected provider. |
| `--no-model-prompt` | Use the automatic default model. |
| `--offline` | Prevent Copilot from contacting GitHub in BYOK mode. |
| `--wire-api <api>` | BYOK wire API: `completions` or `responses`. |
| `--dry-run` | Print the resolved command and environment without launching Copilot. |
| `-h`, `--help` | Show the help text. |
| `-v`, `--version` | Print the `copilot-byok` version. |

Any other argument, and everything after `--`, is forwarded unchanged to GitHub Copilot CLI.

## Built-In Providers

The CLI includes documented presets for direct OpenAI and Anthropic access, local Ollama, OpenCode Go, and major OpenAI-compatible providers. OpenCode Go is split by wire protocol so only compatible models are offered by each preset.

API keys are read from environment variables. For example:

```sh
export CHUTES_API_KEY=...
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export OPENCODE_GO_API_KEY=...
export FIREWORKS_API_KEY=...
export DEEPSEEK_API_KEY=...
export ZAI_API_KEY=...
export MINIMAX_API_KEY=...
export OPENROUTER_API_KEY=...
export MOONSHOT_API_KEY=...
export GROQ_API_KEY=...
export XAI_API_KEY=...
export MISTRAL_API_KEY=...
export ALIBABA_TOKEN_PLAN_API_KEY=...
export TENCENT_TOKEN_PLAN_API_KEY=...
```

PowerShell:

```powershell
$env:CHUTES_API_KEY = "..."
$env:OPENAI_API_KEY = "..."
$env:ANTHROPIC_API_KEY = "..."
$env:OPENCODE_GO_API_KEY = "..."
$env:FIREWORKS_API_KEY = "..."
$env:DEEPSEEK_API_KEY = "..."
$env:ZAI_API_KEY = "..."
$env:MINIMAX_API_KEY = "..."
$env:OPENROUTER_API_KEY = "..."
$env:MOONSHOT_API_KEY = "..."
$env:GROQ_API_KEY = "..."
$env:XAI_API_KEY = "..."
$env:MISTRAL_API_KEY = "..."
$env:ALIBABA_TOKEN_PLAN_API_KEY = "..."
$env:TENCENT_TOKEN_PLAN_API_KEY = "..."
```

Every preset is based on the provider's official API documentation:

| Provider (id / aliases) | Protocol | Official endpoint | Default model | Documentation |
|---|---|---|---|---|
| OpenAI (`openai`) | OpenAI Responses | `https://api.openai.com/v1` | `gpt-5.6-sol` | [OpenAI models](https://developers.openai.com/api/docs/models) |
| Anthropic (`anthropic`, `claude`) | Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-6` | [Anthropic Models API](https://platform.claude.com/docs/en/api/models/list) |
| Ollama (`ollama`) | OpenAI | `http://localhost:11434/v1` | first compatible local model | [GitHub Copilot BYOK docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-byok-models) |
| Chutes (`chutes`) | OpenAI | `https://llm.chutes.ai/v1` | auto-ranked | [Chutes docs](https://chutes.ai/docs) |
| OpenCode Go (`opencode-go`, `go`, `opencode`) | Anthropic | `https://opencode.ai/zen/go` | `minimax-m3` | [OpenCode Go endpoints](https://opencode.ai/docs/go/) |
| OpenCode Go OpenAI (`opencode-go-openai`, `go-openai`) | OpenAI | `https://opencode.ai/zen/go/v1` | `deepseek-v4-pro` | [OpenCode Go endpoints](https://opencode.ai/docs/go/) |
| Fireworks AI (`fireworks`, `fire`) | Anthropic | `https://api.fireworks.ai/inference` | auto-ranked | [Fireworks Anthropic compatibility](https://docs.fireworks.ai/tools-sdks/anthropic-compatibility) |
| OpenRouter (`openrouter`, `or`) | OpenAI | `https://openrouter.ai/api/v1` | `openrouter/auto` | [OpenRouter models API](https://openrouter.ai/docs/api/api-reference/models/get-models) |
| Moonshot AI (`moonshot`, `kimi`) | OpenAI | `https://api.moonshot.ai/v1` | `kimi-k3` | [Kimi models API](https://platform.kimi.ai/docs/api/list-models) |
| DeepSeek (`deepseek`) | OpenAI | `https://api.deepseek.com` | `deepseek-v4-pro` | [DeepSeek models API](https://api-docs.deepseek.com/api/list-models) |
| Groq (`groq`) | OpenAI | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | [Groq OpenAI compatibility](https://console.groq.com/docs/openai) |
| xAI (`xai`, `grok`) | OpenAI | `https://api.x.ai/v1` | `grok-4.5` | [xAI models API](https://docs.x.ai/developers/rest-api-reference/inference/models) |
| Mistral AI (`mistral`, `mistral-ai`) | OpenAI | `https://api.mistral.ai/v1` | `devstral-latest` | [Mistral Models API](https://docs.mistral.ai/api/endpoint/models) |
| Z.ai Coding Plan (`zai`, `glm`) | OpenAI | `https://api.z.ai/api/coding/paas/v4` | `glm-5.2` | [Z.ai HTTP API](https://docs.z.ai/guides/develop/http/introduction) |
| Z.ai API (`zai-api`, `glm-api`) | OpenAI | `https://api.z.ai/api/paas/v4` | `glm-5.2` | [Z.ai HTTP API](https://docs.z.ai/guides/develop/http/introduction) |
| MiniMax (`minimax`) | OpenAI | `https://api.minimax.io/v1` | `MiniMax-M3` | [MiniMax models API](https://platform.minimax.io/docs/api-reference/models/openai/list-models) |
| Alibaba Model Studio Token Plan (`alibaba-token-plan`, `qwen`) | OpenAI | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `qwen3.7-plus` | [Alibaba Token Plan quickstart](https://help.aliyun.com/en/model-studio/token-plan-personal-quick-start) |
| Tencent Cloud Token Plan (`tencent-token-plan`, `tokenhub`) | OpenAI | `https://api.lkeap.cloud.tencent.com/plan/v3` | `tc-code-latest` | [Tencent Token Plan quickstart](https://cloud.tencent.com/document/product/1823/130119) |

Provider-specific examples:

```sh
copilot-byok --provider deepseek --no-model-prompt -p "Explain this repository"
copilot-byok --provider openai --no-model-prompt -p "Review this repository"
copilot-byok --provider ollama --model qwen3-coder -p "Explain this function"
copilot-byok --provider zai --model glm-5.2 -p "Reply exactly: OK"
copilot-byok --provider minimax --model MiniMax-M3 -p "Summarize the latest diff"
copilot-byok --provider openrouter --offline --no-model-prompt
copilot-byok --provider kimi --model kimi-k3 -p "Review this diff"
copilot-byok --provider qwen --model qwen3.7-plus -p "Fix the failing tests"
copilot-byok --provider tokenhub --model tc-code-latest -p "Refactor this module"
```

`zai` keeps the Coding Plan endpoint and existing aliases; `zai-api` targets the separate pay-as-you-go endpoint. OpenCode Go Messages-compatible models use `opencode-go`, while its Chat Completions models use `opencode-go-openai`.

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

- Place the configured `defaultModel` first, followed by ranked catalog alternatives.
- Exclude non-chat/non-agent model names such as image, video, moderation, realtime, embedding, rerank, OCR, guard, TTS, Whisper, audio, and diffusion models.
- Require text input and output when the provider exposes modality metadata.
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
| `authRequired` | no | Whether launching requires an API key or bearer token; defaults to `true`. Set `false` only for authless endpoints such as local Ollama. |
| `apiKeyEnv` | no | Env var name or list of names for API key lookup. |
| `bearerTokenEnv` | no | Env var name or list for bearer token lookup. |
| `modelsUrl` | no | URL used to fetch model catalog. |
| `modelsAuth` | no | Catalog auth mode: `bearer`, `x-api-key`, or `api-key`; `true` remains a bearer alias and explicitly permits cross-origin auth. Use `false` or `none` to disable it. |
| `modelsHeaders` | no | Non-secret string headers for model catalog requests. |
| `modelsTimeoutMs` | no | Catalog timeout from 10 to 300000 ms; defaults to 10000 ms. |
| `catalogModelId` | no | Built-in Copilot model id for internal capabilities. |
| `defaultModel` | no | Automatic default model, placed before ranked catalog alternatives. |
| `modelIncludePrefixes` | no | Case-insensitive model-id prefixes allowed from the catalog. |
| `modelExcludePrefixes` | no | Case-insensitive model-id prefixes removed from the catalog after inclusion filtering. |
| `wireApi` | no | BYOK wire API: `completions` or `responses`. |
| `transport` | no | Copilot provider transport: `http` or `websockets`. |
| `azureApiVersion` | no | Azure OpenAI API version passed to Copilot. |
| `maxPromptTokens` | no | Manual prompt token limit. |
| `maxOutputTokens` | no | Manual output token limit. |
| `requireToolSupport` | no | Exclude models without tool support metadata. |

## Safety

- API keys are read from environment variables.
- Provider config files cannot contain inline API keys or bearer tokens.
- Dry-run output redacts secret env values.
- Stale `COPILOT_PROVIDER_*`, `COPILOT_MODEL`, and `COPILOT_OFFLINE` variables are stripped before launching Copilot.
- Provider source-key variables are removed case-insensitively from the child environment.
- Catalog requests time out after 10 seconds by default and responses are limited to 5 MiB.
- Credentials are sent automatically only to same-origin catalog URLs; cross-origin auth requires an explicit `modelsAuth` mode.
- BYOK environment variables are passed only to the child Copilot process.
- The tool does not write tokens to disk.

## Development

Run the complete local quality gate:

```sh
npm ci
npm run lint
npm test
npm run test:coverage
npm pack --dry-run
npm audit --omit=dev --audit-level=high
```

Run a dry-run:

```sh
copilot-byok --provider chutes --no-model-prompt --dry-run -p "hello"
```

See [Provider verification](docs/provider-verification.md) for the latest reproducible test matrix. It distinguishes endpoint reachability, authenticated catalog access, and complete Copilot CLI inference; these are intentionally not treated as equivalent claims.

## Project Structure

```text
bin/       Executable entry point (copilot-byok)
src/       CLI modules: argument parsing, config, model ranking, environment building
test/      node:test suites, one per src module
schemas/   JSON Schema for provider configuration files
examples/  Ready-to-copy provider configuration example
docs/      Provider verification matrix and troubleshooting guide
```

## Release Process

Prepare a release on a branch with `npm version <version> --no-git-tag-version`, then synchronize `package.json`, `package-lock.json`, `CITATION.cff`, `CHANGELOG.md`, and the pinned versions in this README. Run the complete validation gate before requesting approval.

After the pull request is approved, merged into `main`, and CI passes on every supported platform, release from the exact `main` commit:

```sh
git switch main
git pull --ff-only origin main
npm pack --dry-run
git tag v<version>
git push origin v<version>
gh release create v<version> --title "Copilot BYOK Switcher <version>" --notes-file <notes>
npm publish
```

Tagging, GitHub Release creation, and npm publication are separate states. Verify the remote tag and release commit, the npm `latest` version and `gitHead`, and a clean install of the published CLI before announcing completion.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the local quality gate and the requirements for provider changes, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for expected conduct. Automation and AI agents should also read [AGENTS.md](AGENTS.md).

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Do not open public issues for security reports and never include real API keys in issues, pull requests, or configuration examples.

## Changelog

Released changes are documented in [CHANGELOG.md](CHANGELOG.md).

## Support

For common setup and provider problems, read the [troubleshooting guide](docs/troubleshooting.md). Search the [existing issues](https://github.com/TheStreamCode/copilot-byok-switcher/issues) before opening a new report. Suggest providers or share sanitized compatibility results in the [provider requests discussion](https://github.com/TheStreamCode/copilot-byok-switcher/discussions/14).

If this CLI saves you time when testing Copilot BYOK providers, support continued maintenance through GitHub Sponsors: [github.com/sponsors/TheStreamCode](https://github.com/sponsors/TheStreamCode).

## License

[MIT](LICENSE) © Michael Gasperini (Mikesoft).

## Third-Party Notice

GitHub and GitHub Copilot are trademarks of GitHub, Inc. This project is not affiliated with or endorsed by GitHub.
