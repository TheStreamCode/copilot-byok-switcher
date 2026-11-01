# AGENTS.md

Operating instructions for AI agents and automation working on **copilot-byok-switcher**.
Read this file before changing anything in this repository.

## Project overview

`copilot-byok-switcher` is a published, public npm package (`copilot-byok-switcher`, MIT) that
installs a single cross-platform CLI, `copilot-byok`. It publishes the user's own provider models
into the GitHub Copilot CLI `/model` picker, alongside the GitHub ones, in a single session.

It does this with a local router: Copilot is pointed at `127.0.0.1` through the `COPILOT_API_URL`
variable, the router appends the configured models to `GET /models`, forwards `byok-*` requests to
the matching provider, and passes everything else through to GitHub unchanged. There is no TLS
interception. It never modifies the user's shell profile, and it writes credentials to disk only
through the opt-in key store (`copilot-byok keys set` or `/byok`), never on its own initiative.

`--native-byok` publishes the same models through the CLI's supported `providers.json` registry
instead: discovery runs as usual, a private temporary registry is written, `COPILOT_PROVIDERS_CONFIG`
points at it for the child process, and it is deleted when the session ends. That file contains the
provider credentials for the session, which is why the mode stays opt-in.

`COPILOT_API_URL` is an internal Copilot CLI variable, absent from `copilot help environment`.
Treat it as the project's main external risk: if a CLI release changes it, the router breaks and
`--native` / `--legacy` are the fallbacks. Do not assume other undocumented variables exist —
verify them against a real CLI before relying on any.

Distribution channels actually configured:

- npm registry (public, `latest` dist-tag) — `npm publish` from the repository root.
- GitHub Releases with `v<version>` tags.

There is no VS Code extension, no bundler, no compiled output, and no hosted deployment.

## Stack and runtime

- Node.js **>= 22.13.0** (`engines.node`); CI runs Node 22 and 24 on Ubuntu, Windows, and macOS.
- Plain ESM JavaScript (`"type": "module"`, `.mjs` sources). **No TypeScript, no build step, no transpiler.**
- Package manager: **npm** with the committed `package-lock.json`. Never introduce pnpm, Yarn, or Bun,
  and never add a second lockfile.
- Runtime dependencies: `cross-spawn` only. Dev dependencies: `eslint`, `@eslint/js`, `globals`.
  Keep the runtime dependency surface minimal — prefer Node built-ins (`node:fs`, `node:readline/promises`,
  global `fetch`, `AbortSignal.timeout`).
- Tests use the built-in `node:test` runner and `node:assert/strict`. No Jest, Vitest, or Mocha.

## Repository structure

```text
bin/copilot-byok.mjs      Executable entry point; only wires main() to process.exitCode
src/args.mjs              Pure argument parser; no I/O
src/argv-config.mjs       Pure --config extraction for subcommands
src/cli.mjs               Orchestration: router mode (default), native registry mode, legacy mode
src/router.mjs            The local proxy: model injection, provider routing, passthrough
src/catalog.mjs           Turns providers into the model entries Copilot expects from GET /models
src/launcher.mjs          Starts the router on an ephemeral port and spawns Copilot against it
src/upstream.mjs          Resolves the Copilot API tier (individual / business / enterprise, data residency)
src/discovery.mjs         Asks each provider for its live model list; falls back to the remembered list
src/model-cache.mjs       Remembers the last model list each provider returned
src/models-auth.mjs       Scopes provider credentials to the catalog origin (pure)
src/config.mjs            Provider config loading and validation; loads providers.default.json
src/providers.default.json  Generated catalog — never edit by hand, run npm run catalog:update
src/native-registry.mjs   Pure translation of providers into the CLI's providers.json registry
src/registry-file.mjs     Reads/writes the native registry; private temp file for one session
src/keystore.mjs          Optional on-disk key store (0600 / owner-only ACL)
src/keys-command.mjs      `copilot-byok keys ...`
src/doctor.mjs            `copilot-byok doctor`; installation diagnostics
src/models-command.mjs    `copilot-byok models`; discovery output without a session
src/extension-install.mjs `copilot-byok extension ...`; rewrites the template's package root
src/shim-install.mjs      `copilot-byok shim ...`; writes the per-platform `copilot` shim
src/session-log.mjs       Router diagnostics to a file, never over Copilot's TUI
src/progress.mjs          Startup activity line (TTY only)
src/copilot-bin.mjs       Resolves the Copilot executable, skipping the stale VS Code shim
src/model-ranking.mjs     Pure ranking of provider model catalogs (legacy mode)
src/process-env.mjs       Strips stale/secret variables from the child environment
src/provider-env.mjs      Builds the COPILOT_PROVIDER_* variables (legacy mode)
scripts/update-catalog.mjs  Rebuilds the endpoint catalog (offline, no network)
scripts/catalog-sources.json  Provider endpoints feeding the generator
extensions/byok/extension.mjs  The /byok slash command, copied into ~/.copilot/extensions/
test/*.test.mjs           One suite per src module
schemas/providers.schema.json  Published JSON Schema for providers.json
examples/providers.example.json  Documented example configuration
docs/provider-verification.md    Evidence matrix for provider claims
docs/providers.md               Provider table, keys, model discovery, the /byok command
docs/configuration.md           Custom providers.json, native registry mode, commands, environment variables, shim, reasoning effort
docs/how-it-works.md            Router design, native registry mode, COPILOT_API_URL dependency, picker behavior
docs/troubleshooting.md         Failure modes and diagnostics
```

## Commands

All commands run from the repository root.

| Purpose | Command |
|---|---|
| Install dependencies | `npm ci` |
| Lint | `npm run lint` |
| Test | `npm test` |
| Test with coverage | `npm run test:coverage` |
| Full quality gate | `npm run check` (lint + test) |
| Verify providers serve usable models | `npm run catalog:audit` |
| Package contents check | `npm pack --dry-run` |
| Dependency audit | `npm audit --omit=dev --audit-level=high` |
| Local install for manual testing | `npm link` then `copilot-byok --help` |
| Publish (maintainer only) | `npm publish` (runs `prepack` → `npm run check`) |

There is no `dev`, `build`, `format`, or `type-check` script. Do not invent one in documentation.

## Conventions

- Two-space indentation, single quotes, semicolons, trailing commas in multiline literals.
- Named exports only; no default exports outside `bin/`.
- Modules stay small and single-purpose. `args.mjs`, `argv-config.mjs`, `catalog.mjs`,
  `model-ranking.mjs`, `models-auth.mjs`, `native-registry.mjs`, `process-env.mjs`, and
  `provider-env.mjs` must remain **pure** (no file, network, or process access) so they stay trivially testable.
- All I/O is injected through the `io` object (`{ stdin, stdout, stderr, env }`) passed to `main()`.
  Never read `process.env` or write to `process.stdout` directly from `src/` outside the documented defaults.
- Errors are thrown as `Error` with actionable messages; `bin/copilot-byok.mjs` prints them prefixed with
  `copilot-byok:` and sets a non-zero exit code.
- Conventional Commits for commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `test:`).
- Files are LF-normalized through `.gitattributes`. Do not commit CRLF.

## Security rules (non-negotiable)

This project handles third-party provider API keys. Every change must preserve these guarantees:

- Credentials come from environment variables named by `apiKeyEnv` / `bearerTokenEnv`, or from the
  opt-in key store in `src/keystore.mjs`. The environment always wins over the store. Inline `apiKey`,
  `bearerToken`, and secret-bearing `modelsHeaders` in provider config files are rejected by
  `src/config.mjs` — keep those checks.
- The key store is written `0600` with an owner-only ACL on Windows, and only ever populated from an
  interactive prompt: never accept a key from argv, stdin pipes, or an environment variable meant for
  something else. It must stay opt-in — nothing may create it implicitly.
- Never print, log, or embed a credential value. `--dry-run` output must keep passing through `redactEnv()`,
  which masks any key matching `/KEY|TOKEN|SECRET|PASSWORD/i`.
- Error messages must not reveal which environment variable holds a secret (covered by a test).
- Model-catalog requests send credentials only when the catalog URL is same-origin with `baseUrl`,
  or when the provider explicitly sets an authenticated `modelsAuth` mode (`bearer`, `x-api-key`, or
  `api-key`; `true` remains a bearer alias). Do not weaken this default.
- `sanitizeCopilotEnvironment()` strips `COPILOT_PROVIDER_*` and every known provider source key
  (case-insensitively) from the child environment. New built-in providers **must** have their key
  environment names added to `DEFAULT_SECRET_SOURCE_ENV` in `src/process-env.mjs`.
- Processes are spawned with `shell: false` via `cross-spawn`. Never set `shell: true` and never build a
  command string by concatenation — this is the Windows command-injection defense, and it is covered by a test.
- Catalog requests must keep a bounded timeout (`AbortSignal.timeout`, default 10 s, configurable 10–300000 ms).
- No `.env` file is used or expected; there is no `.env.example`. Do not add one.
- Never commit real keys, tokens, or a `providers.json` containing credentials.
- `--native-byok` writes provider credentials to a temporary registry because the CLI's supported
  path requires them inline. That file must keep `0600` (owner-only ACL on Windows), live in the
  system temp directory, and be removed on exit, including on failure. It must never be written to
  the repository or to the user's Copilot config directory.
- `--legacy` must keep isolating itself from a user `providers.json` when one is present: that file
  takes precedence over `COPILOT_PROVIDER_*`, and silently using it would break the mode.

## Adding or changing a built-in provider

The catalog is generated. **Never hand-edit `src/providers.default.json`** — it is overwritten.

1. Add the provider to `scripts/catalog-sources.json`, using only endpoints documented by the
   provider, then run `npm run catalog:update`. List no models: the picker is filled
   by live discovery from the provider's `GET /models`.
2. Run `npm run catalog:audit` after changing the catalog. A provider that answers
   but yields no usable chat model fails the audit; providers without a configured
   key are reported as unverifiable.
3. Verify the endpoint yourself before adding it: `POST {baseUrl}/chat/completions` with an invalid
   key must answer `400`/`401`/`403`, not `404`. A `404` usually means the path is wrong.
4. For authenticated providers, add every credential environment name to `DEFAULT_SECRET_SOURCE_ENV`
   in `src/process-env.mjs`. For intentionally authless providers set `authRequired: false` and do
   not invent a credential environment name.
5. Add the row to the provider table in `docs/providers.md`.
6. Update `docs/provider-verification.md` honestly: endpoint reachability, authenticated catalog
   access, and end-to-end inference are three distinct evidence levels. Never claim a level that was
   not actually verified.

Model entries must not overstate capabilities. Copilot's harness trusts what `capabilities.supports`
declares: a model advertised with `tool_calls` that cannot call tools fails in the middle of a
session instead of failing cleanly at startup.

In legacy mode only, `catalogModelId` must be a model that exists in Copilot's built-in catalog (for
`COPILOT_MODEL`), while the provider's own model name goes on the wire as
`COPILOT_PROVIDER_WIRE_MODEL`. Do not merge the two.

Anything a user needs at runtime must be listed in `files` in `package.json`.
`extensions/` and `scripts/` are there for that reason: without them
`copilot-byok extension install` and `npm run catalog:update` break for anyone
who installed from npm rather than from a clone.

Tests that exercise `shim` **must** set `COPILOT_BYOK_SHIM_DIR` and
`COPILOT_BYOK_PROFILE_DIR` to temporary directories. Without the second one,
`shim uninstall` resolves the real profile paths and will wipe the developer's own
`.bashrc` or PowerShell profile — this happened once, and it silently undid a fix
that had already been verified working.

## Compatibility and anti-breaking-change rules

- The CLI contract is public: existing flags, aliases, provider ids, and the `--dry-run` JSON shape must keep
  working. Add options; do not rename or remove them. `--native-byok`, `doctor`, and `models` are additive;
  the existing `--dry-run` shapes keep their keys, and the new native mode reports `"mode": "native-byok"`.
- Unrecognized arguments and everything after `--` are forwarded verbatim to Copilot CLI. Do not start
  consuming new argument names without documenting the change in the README, the relevant `docs/` page, and
  `CHANGELOG.md`.
- `schemas/providers.schema.json` is referenced by `$id` from `main`; only widen it, never narrow it.
- Keep `engines.node` and the CI matrix in sync; raising the minimum Node version is a breaking change.

## Validation required before any commit

Run and pass all of these:

```sh
npm ci
npm run lint
npm test
npm pack --dry-run
npm audit --omit=dev --audit-level=high
```

Never disable a lint rule, skip a test, or bypass a hook to make the gate green. `npm pack --dry-run` must
show only `bin/`, `src/`, `examples/`, `docs/`, `schemas/`, `package.json`, `README.md`, `CHANGELOG.md`,
`SECURITY.md`, and `LICENSE` — no `node_modules`, no tests, no local configuration.

## Versioning and release

- Semantic Versioning. Patch for fixes, cleanup, and documentation; minor for backward-compatible features;
  major only for intentional breaking changes.
- Bump with `npm version <new> --no-git-tag-version` so `package.json` and `package-lock.json` stay in sync,
  then update `CITATION.cff` and `CHANGELOG.md` to the same number. The README carries no version pins; it
  points at badges and the changelog instead.
- `main` is protected: all six CI jobs are required, conversations must be resolved, and history stays
  linear. The single maintainer cannot self-approve, so no approving review is required. Push a branch and open
  a pull request; never force-push, never rewrite history, never use admin bypass.
- Tag (`v<version>`), GitHub Release, and `npm publish` happen only after the pull request is merged into `main`
  and CI is green.

## Generated or externally-owned files — do not hand-edit

- `package-lock.json` — regenerate through npm only.
- The version field in `package.json` — change it with `npm version`.
- Action SHAs in `.github/workflows/ci.yml` are pinned to immutable commits with a `# vX.Y.Z` comment.
  Keep both in sync when updating.
- Dependabot version updates are configured in `.github/dependabot.yml`. Do not change that update policy,
  disable it, or re-enable it without an explicit request.

## Repository visibility

This repository is **public** and the package is published to the public npm registry. Everything committed
here is world-readable: no internal URLs, no customer data, no credentials, no unverifiable claims, no
fabricated badges or statistics. Never change repository visibility.
