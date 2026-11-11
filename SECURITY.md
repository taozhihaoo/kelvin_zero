# Security Policy

## Supported Versions

KELVIN ZERO is a client-side WebGL2 demo. Only the latest commit on the `main`
branch receives security fixes.

| Version | Supported |
| --- | --- |
| `main` (latest) | Yes |
| Older commits / forks | No |

## Reporting a Vulnerability

Please report security issues privately through a GitHub Security Advisory for
this repository, or open a draft issue that does not include exploit details and
request a private follow-up. Do not post reproduction steps for an unpatched
issue in a public issue, discussion, or pull request.

Include, if possible:

- the affected commit or tag;
- browser, OS, and GPU/driver details;
- a minimal reproduction;
- the observed impact and a suggested fix, if any.

You should receive an acknowledgement within a few days. Once a fix is
available it will be released on `main`, and the advisory will be published
with credit to the reporter unless anonymity is requested.

## Threat Model Notes

- The application has no backend, no accounts, no analytics, no network
  requests, and no `localStorage` usage.
- All visual content is generated procedurally at runtime; there are no
  external images, fonts, models, scripts, or CDN dependencies.
- Sound is opt-in and only starts after an explicit user gesture.
- Sensitive data is never collected, stored, or transmitted.

## Dependency Updates

Runtime dependencies are pinned (`three@0.170.0`) or semver-ranged (`gsap`).
CI runs `npm ci`, a TypeScript typecheck, unit tests, a production build, and a
headless browser smoke test on every push and pull request. Dependabot alerts,
if enabled for the repository, should be reviewed against the CI results before
merging.
