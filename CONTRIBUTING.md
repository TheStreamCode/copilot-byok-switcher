# Contributing

Thanks for your interest in improving copilot-byok-switcher.

## Development

```bash
npm ci
npm run check
npm run test:coverage
npm pack --dry-run
```

Development requires Node.js 22.13 or newer. Keep changes focused and covered by tests under `test/`. The CLI must remain cross-platform across Windows, macOS, and Linux.

Provider changes must cite the provider's official API documentation in `README.md` and include tests for endpoint, model behavior, aliases, authentication requirements, and credential environment names when applicable. Authless presets must set `authRequired: false` and must not invent a credential variable. Never add real credentials, inline secret examples, or unauthenticated cross-origin credential forwarding.

## Pull Requests

- Add or update tests for behavior changes.
- Run `npm run check` and `npm pack --dry-run` before submitting.
- Keep user-facing behavior documented in `README.md`.
- Update `CHANGELOG.md` for user-visible changes.
- Use a focused title and explain both the behavior change and its verification.
