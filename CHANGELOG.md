# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.3.0] - 2026-08-08

### Added

- Built-in presets for OpenAI, Anthropic, local Ollama, Groq, xAI, Mistral AI, the Z.ai pay-as-you-go API, and the OpenAI-compatible OpenCode Go endpoint.
- Optional provider authentication through `authRequired: false`, catalog authentication modes for bearer, `x-api-key`, and `api-key`, model include/exclude prefixes, transport selection, and Azure API version forwarding.
- A 5 MiB model-catalog response limit and model-id validation against terminal control characters and excessive lengths.

### Changed

- OpenCode Go now keeps Messages-compatible MiniMax/Qwen models separate from Chat Completions models; all existing `opencode-go`, `go`, and `opencode` identifiers remain valid.
- A configured `defaultModel` is now the actual automatic default, ahead of ranked catalog alternatives.
- Model ranking filters non-chat output modalities and additional image, video, moderation, realtime, transcription, speech, and safety model families, and understands nested capability/context metadata.
- Updated Z.ai Coding Plan to `glm-5.2`, MiniMax to `MiniMax-M3`, ESLint to 10.8.1, globals to 17.9.0, and the fixed `brace-expansion` transitive release.

### Security

- Native and BYOK launches strip stale `COPILOT_MODEL`, `COPILOT_OFFLINE`, all `COPILOT_PROVIDER_*` variables, and built-in or custom provider credential sources from the Copilot child environment.
- Inline credential fields are rejected even when empty; credential-like URL query parameters and broader secret-bearing catalog headers are also rejected.
- Bearer credentials now take precedence over API keys instead of emitting both to the child process.
- CI audits both production and development dependencies at high severity.

### Fixed

- Authless local providers such as Ollama no longer require a dummy API key.
- Native mode still ignores malformed provider configuration for startup, while valid custom configuration is used to sanitize secret-source variables.
- Non-`ENOENT` configuration discovery errors are no longer silently treated as a missing file.

## [0.2.0] - 2026-08-01

### Added

- `-v` / `--version` prints the installed `copilot-byok` version. The flag is consumed by the switcher and is
  no longer forwarded to GitHub Copilot CLI; use `-- --version` to pass it through.
- A `Command-Line Options` table, a `Project Structure` section, and explicit `Release Process`,
  `Contributing`, `Security`, `Changelog`, and `License` sections in `README.md`.
- `AGENTS.md` with the project-specific stack, commands, security rules, provider checklist, validation gate,
  and release process for contributors and AI agents.
- Node.js engine and license badges in `README.md`.
- Tests for `--help`, `--version`, interactive provider selection, interactive model selection, and the
  missing-binary error path (39 tests to 45; line coverage 87.3% to 93.0%).

### Changed

- A missing or unreachable Copilot executable now fails with an actionable message naming the resolved path
  and the install command, instead of a raw `spawn ... ENOENT`.
- CI runs on pushes to `main` and to `v*` tags, on pull requests, and on manual dispatch, removing the
  duplicate workflow run that every pull-request branch previously triggered.
- The security contact link in the issue-template chooser points to `SECURITY.md` instead of a generic site URL.

### Fixed

- Removed a dead `platform` argument passed to `buildCopilotSpawnOptions`, which does not accept it.

### Internal

- ESLint ignores `coverage/`, so `npm run lint` after `npm run test:coverage` no longer depends on cleanup.
- `.gitignore` covers `*.tgz` (`npm pack` output) and `Thumbs.db`.
- Consolidated the duplicated `src/cli.mjs` import in `test/cli.test.mjs`.

## [0.1.0] - 2026-08-01

- Published the first stable package to npm and created the matching GitHub
  release and version tag.
- Added a standard `.gitattributes` file to normalize line endings across platforms (`* text=auto eol=lf`, with binary markers for image/vsix assets).
- Added documented built-in presets for OpenRouter, Moonshot AI/Kimi, Alibaba Model Studio Token Plan, and Tencent Cloud Token Plan.
- Updated the Z.ai Coding Plan fallback to `glm-5.1`.
- Added `--offline` and `--wire-api completions|responses` support for current Copilot CLI BYOK capabilities.
- Set the required `COPILOT_MODEL` catalog value separately from `COPILOT_PROVIDER_WIRE_MODEL`.
- Hardened process launching against Windows shell injection by using shell-free cross-platform spawning.
- Added standalone Copilot binary discovery that skips the stale VS Code shim when an npm installation is available.
- Documented a reproducible provider verification matrix with explicit evidence levels.
- Added strict provider-config validation, model-catalog timeouts, safe same-origin authentication defaults, and case-insensitive secret sanitization.
- Added a distributable JSON Schema for provider configuration editor support.
- Improved model ranking for OpenRouter metadata and provider catalogs returned as arrays.
- Expanded tests, package checks, security documentation, and CI coverage for Node.js 22/24 on Windows, macOS, and Linux.
- Pinned GitHub Actions to immutable commits and removed the inactive Dependabot auto-merge workflow.
- Initial release: cross-platform launcher for GitHub Copilot CLI custom model
  providers (BYOK), with interactive provider selection, automatic model
  defaults, and isolated provider environment handling.
