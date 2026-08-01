# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
