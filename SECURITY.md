# Security Policy

## Supported versions

Security fixes are applied to the latest release only.

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Email security concerns to info@mikesoft.it with the affected version, impact, reproduction steps, and any suggested mitigation. You should receive an acknowledgement within five business days.

## How credentials are handled

**Provider keys.** They are read from environment variables or, if you opt in, from the local key store. In router mode the keys stay in the router's own process: they are attached to that provider's outgoing request and stripped from the environment handed to Copilot CLI, so the agent process never sees them. In `--legacy` mode the selected credential is passed to Copilot itself, because that mode uses Copilot's built-in BYOK variables.

**The local key store.** `copilot-byok keys set` and the `/byok` command write to `~/.config/copilot-byok/keys.json` (`%APPDATA%\copilot-byok\keys.json` on Windows), created with mode `0600` and an owner-only ACL on Windows. **Keys stored there are plain text on disk**, protected by file permissions alone; if that does not fit your threat model, use environment variables, which always take precedence and are the default. The store is never created unless you use it. Keys are only accepted from an interactive prompt, never from command-line arguments or pipes, so they do not reach shell history or process listings.

**Your GitHub token.** In router mode Copilot's traffic passes through a local proxy, so the token flows through it in order to reach GitHub. It is never logged, never written to disk, and never sent anywhere other than the GitHub Copilot API. The router binds to `127.0.0.1` on an ephemeral port and exits with the session.

**Configuration files.** They name environment variables rather than holding secrets. Inline `apiKey` and `bearerToken` fields are rejected, as are secret-bearing model headers and credential-like URL query parameters. Review custom provider URLs before use and do not run untrusted configurations.

**Model catalog requests** (legacy mode) are made by the launcher itself; credentials are sent automatically only when the catalog and the API share the same origin. Cross-origin catalog authentication requires an explicit `modelsAuth` mode: `bearer`, `x-api-key`, or `api-key`; `true` remains a backward-compatible alias for `bearer`.

## The COPILOT_API_URL dependency

Router mode relies on `COPILOT_API_URL`, an environment variable that Copilot CLI honours but does not document. It repoints Copilot's API endpoint at the local router. This is worth stating plainly:

- Nothing is intercepted at the TLS level, no certificate authority is installed, and no system trust store is modified. Copilot talks in the clear to loopback, and the router opens its own ordinary HTTPS connection to GitHub.
- Requests that are not for a BYOK model are forwarded to GitHub unchanged.
- Because the variable is undocumented, a Copilot CLI update may change or remove it. If that happens the router stops receiving traffic; `--native` and `--legacy` remain available.

## Extension

The `/byok` command runs as a Copilot CLI extension, in its own process, and is installed only when you run `copilot-byok extension install`. It receives the ids of the providers configured through environment variables — never their values — so it can report their state.
