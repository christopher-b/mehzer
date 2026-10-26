# Mehzur

Photograph a room, tap two points on a photo to draw a line, and type the real-world length. Group photos into rooms and calculate a room's floor area from two of its measurements.

- **Projects** (one per house), each with its own units: ft/in or m/cm.
- **Photos**: take one with the phone camera or upload from the library; they are resized in the browser before upload.
- **Measurements**: tap two points, enter a length (`12' 6"`, `3.2m`, `320cm`), optionally name it. Drag the end points to adjust.
- **Rooms**: every photo is in one room or in "No room". A room's area is length × width from two of its measurements.
- **Export** a project as CSV or as a PDF with the annotated photos. **Add to home screen** on a phone.
- **Accounts**: sign in with an email and password. The administrator invites people by link; each person sees only their own projects. Passwords can be reset by email. Online only (no offline mode).

Built with SvelteKit 3 (Svelte 5), SQLite (Drizzle ORM) and photos on a disk volume. It runs in Docker (a Node 24 container); an image is published to `ghcr.io/christopher-b/mehzur`. Cloudflare deployment is not supported and is to be removed (see [PLAN.md](PLAN.md)).

## Quick start

Run it with Docker (needs Docker with Compose v2):

```sh
cp .env.example .env      # set APP_PASSWORD and SESSION_SECRET (for example: openssl rand -hex 32)
docker compose up -d --build
```

Open `http://<host>:3000` and sign in. Data lives in the `mehzur-data` volume.

To run the published image on a server instead of building it, see `docker-compose.ghcr.yml` and [docs/deployment.md](docs/deployment.md).

Or develop locally (Node 22.17 or newer; `mise.toml` pins Node 24):

```sh
npm install
cp .env.example .env
npm run dev               # http://localhost:5173, data in ./data
```

On a phone on the same Wi-Fi: `npm run dev -- --host`, then open the Network address it prints.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with a local SQLite file and photo folder (`./data`) |
| `npm run dev:cf` | Dev server on Cloudflare's local D1 and R2 emulation (needs `.dev.vars`) |
| `npm test` | Unit and route tests |
| `npm run test:e2e` | Browser tests in Chromium (`test:e2e:safari` for WebKit) |
| `npm run check` | Type check |
| `npm run build` | Production build for Node/Docker (`build:cf` for Cloudflare) |
| `npm run db:generate` | Create a migration after changing `src/lib/server/db/schema.ts` |
| `npm run deploy:cf` | Build and deploy to Cloudflare |

## Documentation

| | |
|---|---|
| [docs/deployment.md](docs/deployment.md) | Docker settings, HTTPS behind a proxy (including Traefik), backup and restore, error ids and logs |
| [docs/endpoints.md](docs/endpoints.md) | Every server address and what it does |
| [docs/architecture.md](docs/architecture.md) | Code layout, export, home-screen install, error handling, limits |
| [docs/testing.md](docs/testing.md) | Unit and browser tests, running them, Safari |
| [docs/contributing.md](docs/contributing.md) | Environment, SvelteKit 3 conventions, checks before finishing, pitfalls |
| [docs/decisions.md](docs/decisions.md) | Product and technical decisions, data model, known limitations |
| [docs/phone-test-checklist.md](docs/phone-test-checklist.md) | Manual checks on a real phone |
| [PLAN.md](PLAN.md) | What is left to do |
