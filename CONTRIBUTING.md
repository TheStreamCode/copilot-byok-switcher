# Contributing

Thanks for your interest in improving copilot-byok-switcher.

## Development

```bash
npm install
npm run lint
npm test
```

Keep changes focused and covered by tests under `test/`. The CLI must stay cross-platform (Windows, macOS, Linux) and must never transmit provider API keys anywhere.

## Pull Requests

- Add or update tests for behavior changes.
- Run `npm run lint` and `npm test` before submitting.
- Keep user-facing behavior documented in `README.md`.
