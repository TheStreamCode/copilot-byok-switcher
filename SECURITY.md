# Security Policy

## Supported versions

Security fixes are applied to the latest release only.

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Email security concerns to info@mikesoft.it with the affected version, impact, reproduction steps, and any suggested mitigation. You should receive an acknowledgement within five business days.

## Secret handling

This launcher reads provider credentials from environment variables and passes the selected credential to the child GitHub Copilot CLI process. Copilot then sends it to the configured provider. Authenticated model-catalog requests are made directly by this launcher; credentials are sent automatically only when the catalog and API share the same origin. Cross-origin catalog authentication requires an explicit `modelsAuth` mode: `bearer`, `x-api-key`, or `api-key`; `true` remains a backward-compatible alias for `bearer`.

The launcher does not write credentials to disk. Provider configuration files reject inline API keys, bearer tokens, and secret-bearing model headers. Review custom provider URLs before use and do not run untrusted configurations.
