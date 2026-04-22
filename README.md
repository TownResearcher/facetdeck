
# FacetDeck

FacetDeck is a slide-authoring and AI-assisted presentation workflow product with:

- A web frontend (`src/`)
- A local/self-host API server (`server/`)
- A plugin runtime based on sandboxed iframes (`window.FacetDeck.api`)

This repository is the open-source codebase used for self-hosting and community development.

## Open Source + Hosted Model

- The code in this repository is open source.
- You can self-host and bring your own model/API keys.
- The official hosted service is a convenience SaaS for users who do not want to manage infra and provider config.
- Runtime behavior is switched by env mode (`oss` / `saas`) in the same codebase.
- License is `AGPL-3.0-or-later`.

If you modify this software and provide it as a network service, AGPL requires releasing the corresponding modified source.

## Quick Start

### Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm 9+

### Local development

1. Install dependencies
   - `npm install`
2. Create environment file
   - copy `.env.example` to `.env`
   - fill required values such as `RESEND_API_KEY`, `RESEND_FROM`, `JWT_SECRET`
   - set `FACETDECK_DISTRIBUTION_MODE=oss` and `VITE_FACETDECK_MODE=oss` for open-source mode
3. Start both frontend and API
   - `npm run dev:full`

You can also run separately:

- API only: `npm run dev:api`
- Frontend only: `npm run dev`

### Production build

- `npm run build`

## Project Structure

- `src/` - frontend app
- `server/` - local backend/auth APIs
- `scripts/` - development and e2e utilities
- `examples/` - runnable sample projects (including plugin sample)
- `guidelines/` - generation/style guideline sources
- `docs/` - curated documentation index and archived guides

## Core Capabilities

- User auth flows (register, login, forgot password)
- JWT-protected APIs and route guards
- Captcha and anti-abuse constraints
- Plugin system with capability gating and re-authorization flow
- Community plugin publishing/install flow
- Editor/read-write/resource APIs for plugins

## Plugin Development

- Full reference: `PLUGIN_SDK.md`
- Chinese guide: `PLUGIN_SDK_QUICKSTART_ZH.md`
- Runnable sample: `examples/facetdeck-plugin-vite-sample/`

Important: running the sample project only starts the plugin frontend project, not the full FacetDeck SaaS deployment.

## Documentation Map

- Documentation index: `docs/README.md`
- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Open source boundaries: `OPEN_SOURCE_POLICY.md`
- Trademark policy: `TRADEMARK_POLICY.md`
- Maintainer release checklist: `docs/maintainers/OPEN_SOURCE_RELEASE_CHECKLIST.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Changelog: `CHANGELOG.md`

## Security and Hygiene

- Never commit `.env` or real API keys/secrets.
- Never commit runtime databases or data dumps.
- Validate `.gitignore` before publishing.
- Read `SECURITY.md` for reporting channels and disclosure process.

## License

Licensed under `AGPL-3.0-or-later`. See `LICENSE`.