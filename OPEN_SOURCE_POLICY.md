# Open Source Policy

This policy clarifies what this repository provides publicly and what remains private in hosted operations.

## 1) License and Network Use

- Repository license: `AGPL-3.0-or-later`
- If you modify this software and provide it over a network, you must provide corresponding source under AGPL.

## 2) Product Model

FacetDeck uses an open-code + hosted-convenience model:

- Self-host users can run the project and configure their own providers.
- Hosted users can use the official managed service without self-operating infrastructure.
- Repository supports a single-codebase dual-mode switch via environment (`oss` / `saas`).

## 3) Public vs Private Boundary

### Public (in this repository)

- Frontend source (`src/`)
- Local backend source (`server/`)
- Auth/captcha/rate-limit logic implemented in code
- Public docs, examples, and contributor guidance

### Private (not included, must stay private)

- Production databases, backups, and data exports
- Real `.env` values, API keys, tokens, and signing secrets
- Internal billing/customer datasets and private analytics
- Infrastructure credentials (cloud/IAM/CI/CD/DNS/secrets manager)
- Internal operational playbooks and sensitive anti-abuse strategies

## 4) Commercial Usage

Commercial usage is allowed under AGPL terms. The key requirement remains:

- If you run a modified hosted service based on this project, publish the corresponding modified source code under AGPL.

## 5) Branding and Trademarks

- Code is open under AGPL.
- Trademark rights for product name/logo/brand are not automatically granted by the software license.
- Trademark usage is governed by `TRADEMARK_POLICY.md`.

## 6) Contributor and Maintainer Responsibilities

- Contributors must not include private production data/secrets in commits.
- Maintainers must review release artifacts against `docs/maintainers/OPEN_SOURCE_RELEASE_CHECKLIST.md` before public release.

