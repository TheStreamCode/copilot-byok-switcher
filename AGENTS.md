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
src/cli.mjs               Orchestration: router mode (default), legacy mode, native mode
src/router.mjs            The local proxy: model injection, provider routing, passthrough
src/catalog.mjs           Turns providers into the model entries Copilot expects from GET /models
src/launcher.mjs          Starts the router on an ephemeral port and spawns Copilot against it
src/upstream.mjs          Resolves the Copilot API tier (individual / business / enterprise)
src/discovery.mjs         Asks each provider for its live model list; falls back to the catalog
src/config.mjs            Provider config loading and validation; loads providers.default.json
src/providers.default.json  Generated catalog — never edit by hand, run npm run catalog:update
src/keystore.mjs          Optional on-disk key store (0600 / owner-only ACL)
src/keys-command.mjs      `copilot-byok keys ...`
src/extension-install.mjs `copilot-byok extension ...`; rewrites the template's package root
src/shim-install.mjs      `copilot-byok shim ...`; writes the per-platform `copilot` shim
src/session-log.mjs       Router diagnostics to a file, never over Copilot's TUI
src/copilot-bin.mjs       Resolves the Copilot executable, skipping the stale VS Code shim
src/model-ranking.mjs     Pure ranking of provider model catalogs (legacy mode)
src/process-env.mjs       Strips stale/secret variables from the child environment
src/provider-env.mjs      Builds the COPILOT_PROVIDER_* variables (legacy mode)
scripts/update-catalog.mjs  Rebuilds the catalog from models.dev
scripts/catalog-sources.json  Curated provider/model selection feeding the generator
extensions/byok/extension.mjs  The /byok slash command, copied into ~/.copilot/extensions/
test/*.test.mjs           One suite per src module
schemas/providers.schema.json  Published JSON Schema for providers.json
examples/providers.example.json  Documented example configuration
docs/provider-verification.md    Evidence matrix for provider claims
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
| Package contents check | `npm pack --dry-run` |
| Dependency audit | `npm audit --omit=dev --audit-level=high` |
| Local install for manual testing | `npm link` then `copilot-byok --help` |
| Publish (maintainer only) | `npm publish` (runs `prepack` → `npm run check`) |

There is no `dev`, `build`, `format`, or `type-check` script. Do not invent one in documentation.

## Conventions

- Two-space indentation, single quotes, semicolons, trailing commas in multiline literals.
- Named exports only; no default exports outside `bin/`.
- Modules stay small and single-purpose. `args.mjs`, `model-ranking.mjs`, `provider-env.mjs`, and
  `process-env.mjs` must remain **pure** (no file, network, or process access) so they stay trivially testable.
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

## Adding or changing a built-in provider

The catalog is generated. **Never hand-edit `src/providers.default.json`** — it is overwritten.

1. Add the provider to `scripts/catalog-sources.json`, using only endpoints documented by the
   provider, then run `npm run catalog:update`. List model ids under `models`; the generator fills
   in context window and capabilities from models.dev and drops anything without tool-calling
   support. Leave `models` empty when names are account-specific (Volcengine endpoint ids) or the
   catalog is too large to curate (OpenRouter).
2. Verify the endpoint yourself before adding it: `POST {baseUrl}/chat/completions` with an invalid
   key must answer `400`/`401`/`403`, not `404`. A `404` usually means the path is wrong.
3. For authenticated providers, add every credential environment name to `DEFAULT_SECRET_SOURCE_ENV`
   in `src/process-env.mjs`. For intentionally authless providers set `authRequired: false` and do
   not invent a credential environment name.
4. Add the row to the provider table in `README.md`.
5. Update `docs/provider-verification.md` honestly: endpoint reachability, authenticated catalog
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

## Compatibility and anti-breaking-change rules

- The CLI contract is public: existing flags, aliases, provider ids, and the `--dry-run` JSON shape must keep
  working. Add options; do not rename or remove them.
- Unrecognized arguments and everything after `--` are forwarded verbatim to Copilot CLI. Do not start
  consuming new argument names without documenting the change in `README.md` and `CHANGELOG.md`.
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
  then update `CITATION.cff`, `CHANGELOG.md`, and the pinned versions in `README.md` to the same number.
- `main` is protected: required status checks on all six CI jobs and **one approving review**. Push a branch
  and open a pull request; never force-push, never rewrite history, never self-approve, never use admin bypass.
- Tag (`v<version>`), GitHub Release, and `npm publish` happen only after the pull request is merged into `main`
  and CI is green.

## Generated or externally-owned files — do not hand-edit

- `package-lock.json` — regenerate through npm only.
- The version field in `package.json` — change it with `npm version`.
- Action SHAs in `.github/workflows/ci.yml` are pinned to immutable commits with a `# vX.Y.Z` comment.
  Keep both in sync when updating.
- Dependabot version-update PRs were intentionally disabled for this repository. Do not re-enable them
  without an explicit request.

## Repository visibility

This repository is **public** and the package is published to the public npm registry. Everything committed
here is world-readable: no internal URLs, no customer data, no credentials, no unverifiable claims, no
fabricated badges or statistics. Never change repository visibility.
