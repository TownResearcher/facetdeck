# Contributing Guide

Thanks for improving FacetDeck. This guide defines the expected engineering workflow for contributors.

## 1) Before You Start

- Read `README.md` for setup.
- Read `OPEN_SOURCE_POLICY.md` for public/private boundary rules.
- Read `SECURITY.md` before reporting vulnerabilities.
- For behavior changes, update relevant docs in the same PR.

## 2) Local Development Setup

1. Install dependencies
   - `npm install`
2. Prepare local environment
   - copy `.env.example` to `.env`
3. Start dev environment
   - `npm run dev:full`

Useful commands:

- Frontend only: `npm run dev`
- API only: `npm run dev:api`
- Build: `npm run build`

## 3) Branch and Commit Conventions

- Create focused branches (one logical change per branch).
- Recommended branch names:
  - `feat/<short-topic>`
  - `fix/<short-topic>`
  - `docs/<short-topic>`
  - `chore/<short-topic>`
- Keep commits atomic and descriptive.
- Prefer clear imperative commit messages (for example: `docs: clarify plugin re-authorization flow`).

## 4) Coding and Review Expectations

- Keep scope minimal; avoid unrelated refactors.
- Preserve backward compatibility unless change is explicitly breaking.
- Add or update tests when behavior changes.
- Keep user-facing copy and docs consistent with the implementation.
- Do not introduce secrets or personal data into code, tests, fixtures, screenshots, or logs.

## 5) Pull Request Requirements

Every PR should include:

- A concise summary of what changed and why.
- Any migration or compatibility notes.
- Test evidence (commands run, screenshots, or logs where relevant).
- Linked issues/discussions when applicable.

PR checklist:

- [ ] `npm run build` passes
- [ ] Behavior is validated locally
- [ ] Docs are updated for user-visible or API changes
- [ ] No secrets/private data in diff
- [ ] No runtime DB files committed (`*.db`, `*.sqlite`, backups)

## 6) Documentation Change Rules

- API or SDK changes must update `PLUGIN_SDK.md` (and Chinese counterpart if needed).
- Workflow/governance changes must update root governance docs.
- Larger doc additions should be indexed from `docs/README.md`.

## 7) Security Contributions

If your change touches auth, permissions, token flow, rate limits, or plugin sandbox boundaries:

- add explicit test steps in PR description
- call out threat model assumptions
- avoid exposing implementation details that materially weaken protections

For vulnerability reporting, follow `SECURITY.md` (do not open public exploit issues first).

## 8) License

By contributing, you agree your contributions are licensed under:

- `AGPL-3.0-or-later` (same as this repository)

