# Security Policy

## Supported Versions

Security fixes are prioritized for:

| Version / Branch | Status |
|---|---|
| Latest default branch | Supported |
| Older snapshots/tags | Best effort |

## Report a Vulnerability

Do **not** open public issues for active vulnerabilities.

Please report privately to:

- Email: `shaungladtoseeu@gmail.com`

Include:

- Summary and affected component
- Reproduction steps / PoC
- Impact assessment
- Suggested remediation (optional)

## Response Targets

- Initial acknowledgement: within 72 hours
- Triage and severity classification: as soon as practical after acknowledgement
- Fix timeline: depends on severity and exploitability

These are best-effort targets, not contractual SLAs.

## Security Scope

In scope:

- Authentication and authorization logic
- Session and token handling boundaries
- Plugin sandbox boundary escapes
- Permission bypasses (`capability` checks, re-authorization gates)
- Data exposure and secret leakage paths
- Abuse bypasses (captcha/rate-limit controls)

Out of scope (unless chained with real impact):

- Purely theoretical findings with no practical exploit path
- Social engineering
- Denial-of-service requiring unreasonable resources
- Issues in third-party dependencies without a FacetDeck-specific exploit path

## Coordinated Disclosure

1. Report received and acknowledged.
2. Maintainers validate impact and assign severity.
3. Fix is prepared and verified.
4. Disclosure is coordinated after mitigation is available.

Please avoid public disclosure before maintainers confirm remediation status.

## Safe Harbor

If you act in good faith, avoid privacy violations, and avoid service disruption, maintainers will treat your research as authorized for vulnerability disclosure purposes.

## Repository Security Hygiene

Before opening PRs:

- Do not commit `.env`, API keys, or tokens.
- Do not commit runtime databases or backups.
- Do not include customer/billing/production data in fixtures, screenshots, or logs.
- Avoid exposing privileged production endpoints.

