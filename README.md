# Copilot BYOK Switcher

Your own provider models inside the GitHub Copilot CLI `/model` picker

[![CI](https://github.com/TheStreamCode/copilot-byok-switcher/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/copilot-byok-switcher/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/copilot-byok-switcher)](https://www.npmjs.com/package/copilot-byok-switcher)

Copilot BYOK Switcher adds your own provider models to the GitHub Copilot CLI `/model` picker, in
the same session as the GitHub models. Pick an Anthropic, OpenAI, DeepSeek, Qwen, GLM, Kimi or
other provider model and the session talks straight to that provider with your key, while GitHub
authentication and every other Copilot feature keep working. The picker is filled by live
discovery from each configured provider. This is an independent, unofficial project and is not
affiliated with GitHub.

## Install

Install the CLI from the npm registry:

```sh
npm install -g copilot-byok-switcher
```

## Quick start

```sh
# 1. Store a key for each provider you own (prompted, never echoed)
copilot-byok keys set openai
copilot-byok keys set anthropic

# 2. See what is active
copilot-byok --list-providers

# 3. Start Copilot
copilot-byok

# 4. Or publish the same models through the CLI's own BYOK registry
copilot-byok --native-byok
```

Open `/model` inside the session and pick one of your models. Arguments after `--` go to Copilot
unchanged:

```sh
copilot-byok -- -p "fix the failing test" --allow-all-tools
```

## Features

- Your provider models appear in the Copilot CLI `/model` picker next to GitHub's, in the same
  session.
- Use as many providers per session as you configure.
- GitHub models stay available while BYOK is active, and models can be switched with `/model`
  without restarting.
- Two ways to publish them: the default local router, or `--native-byok`, which feeds the CLI's
  own supported `providers.json` registry from the same discovery. The native path has no local
  proxy; it writes a private temporary registry for the session and deletes it on exit.
- Live discovery: each configured provider is asked what it serves at startup, with a remembered
  list as the fallback when a request fails.
- Zero AI credits for BYOK turns; you pay your provider directly.
- Credentials come from environment variables or an opt-in local key store. In router mode they
  never reach the Copilot process; in native mode they are written only to a temporary file with
  owner-only permissions and removed when the session ends.
- No TLS interception: the router binds to loopback and exits with the session.
- Windows, macOS and Linux are supported with Node.js only, with no build step.

## Requirements

- Node.js 22.13 or newer.
- GitHub Copilot CLI 1.0.79 or newer, available as `copilot` on `PATH` (set `COPILOT_BIN` to
  override). The current release line, 1.0.105, is the version this project is verified against;
  `--native-byok` needs a CLI that reads `providers.json`, which 1.0.105 does.
- A GitHub Copilot account, on any plan including free.

## Configuration

Everything has a working default. The most useful settings are listed below; the full reference,
the custom `providers.json` format, the command list and single-provider mode are in the
[configuration guide](docs/configuration.md).

| Setting | Purpose | Default |
| --- | --- | --- |
| `COPILOT_BIN` | Path to the real Copilot CLI when it is not on `PATH` under that name | `copilot` from `PATH` |
| `COPILOT_BYOK_CONFIG` | Provider configuration file (same as `--config`) | Built-in catalog |
| `COPILOT_BYOK_KEYSTORE` | Where stored keys live | Platform config directory |
| `COPILOT_BYOK_PROGRESS=off` | Turns off the startup progress line | Progress line on |
| `COPILOT_BYOK_DEBUG=1` | Streams router events live instead of only to the log | Log only |
| `COPILOT_BYOK_PROVIDER_TIMEOUT_MS` | Idle timeout on a provider request | 10 minutes |
| `COPILOT_GH_HOST`, `GH_HOST` | Data residency tenant host; the router derives `copilot-api.<tenant>.ghe.com` from it | Public GitHub hosts |

All 28 built-in providers, the environment variable for each key, and the model-discovery
behavior are documented in the [providers guide](docs/providers.md).

## Privacy and security

No TLS is intercepted, no certificate authority is installed, the router listens on loopback only
and exits with the session, provider keys never reach GitHub, and your GitHub token passes through
the router unlogged because it has to. In router mode the keys also stay out of the Copilot
process; `--native-byok` writes them to a temporary registry with owner-only permissions for the
duration of the session because that is how the CLI's supported BYOK registry works, and removes it
on exit. Provider keys come from environment variables or the opt-in key store; keys in the store
are plain text on disk protected by file permissions, so environment variables remain the safer
default. `SECURITY.md` covers the full model, including what the undocumented `COPILOT_API_URL`
dependency means for you.

## Troubleshooting

### No BYOK models appear in `/model`

No provider is active. Run `copilot-byok --list-providers` to see which provider is unlocked by
which environment variable or stored key, and `copilot-byok doctor` for a full diagnosis.

### `Unknown BYOK model`

The provider catalog changed since the session started. Restart `copilot-byok`.

### A provider returns 401 or 403

The key for that provider is wrong or expired. This is not a GitHub authentication failure.

### Everything is a GitHub model again

`COPILOT_API_URL` may no longer work on your CLI version. Run `copilot-byok --native` for a stock
session, `copilot-byok --native-byok` to use the CLI's supported registry instead of the router, and
check the router notes in [how it works](docs/how-it-works.md). `copilot-byok doctor` reports the CLI
version it found.

### Startup pauses before the picker opens

Discovery queries each configured provider in parallel; the progress line names the provider being
waited on. Start with `--no-discovery` to work from remembered lists. More failure modes are in
[troubleshooting](docs/troubleshooting.md).

## Development

Requirements: Node.js 22.13 or newer, npm, and the committed `package-lock.json`.

```sh
git clone https://github.com/TheStreamCode/copilot-byok-switcher.git
cd copilot-byok-switcher
npm ci
npm run check
npm run test:coverage
npm pack --dry-run
npm audit --omit=dev --audit-level=high
```

There is no build step: plain ESM JavaScript runs directly. Tests use the built-in `node:test`
runner. See `AGENTS.md` for repository conventions and `CONTRIBUTING.md` before opening a pull
request.

## Support

See `SUPPORT.md`. Usage questions belong in GitHub Discussions, reproducible defects in GitHub
Issues, and security problems in `SECURITY.md` through GitHub Security Advisories.

## Contributing

See `CONTRIBUTING.md`. Run `npm run check` before opening a pull request; CI runs the tests on
Node.js 22 and 24 across Linux, macOS and Windows.

## License

MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 Michael Gasperini (Mikesoft).

---

Maintained by [Michael Gasperini (Mikesoft)](https://mikesoft.it).
If this project is useful to you, consider [sponsoring its maintenance](https://github.com/sponsors/TheStreamCode).
