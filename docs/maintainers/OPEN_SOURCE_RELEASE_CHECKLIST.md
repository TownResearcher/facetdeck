# Open Source Release Checklist (Maintainers)

Use this checklist before public releases or major repository visibility changes.

## 1) Secrets and Sensitive Data

- [ ] `.env` and local secret files are not tracked
- [ ] API keys/tokens removed from code, docs, screenshots, and tests
- [ ] Production databases/backups are excluded
- [ ] Sample data is anonymized
- [ ] Any previously exposed keys are rotated

## 2) License and Governance

- [ ] `LICENSE` exists and is correct (`AGPL-3.0-or-later`)
- [ ] `OPEN_SOURCE_POLICY.md` reviewed and current
- [ ] `SECURITY.md` contains active reporting contact
- [ ] `CONTRIBUTING.md` reflects current workflow
- [ ] `CODE_OF_CONDUCT.md` is present

## 3) Documentation Readiness

- [ ] `README.md` matches current architecture and setup flow
- [ ] `docs/README.md` index links are valid
- [ ] Plugin docs (`PLUGIN_SDK.md`, `PLUGIN_SDK_QUICKSTART_ZH.md`) reflect current APIs
- [ ] Any moved/deprecated docs contain migration pointers

## 4) Technical Validation

- [ ] `npm install` works on a clean machine
- [ ] `npm run dev:full` starts frontend + API
- [ ] `npm run build` succeeds
- [ ] `.env.example` contains placeholders only (no real secrets)
- [ ] Critical smoke tests are executed or explicitly waived

## 5) Release Packaging

- [ ] Changelog updated (`CHANGELOG.md`)
- [ ] Release notes drafted (breaking changes, migration notes, known issues)
- [ ] Version tag/release plan prepared
- [ ] Optional: issue templates/discussion channels ready

## 6) Final Gate

- [ ] A maintainer completed final scan for private links/data
- [ ] Another maintainer reviewed release readiness (recommended)
