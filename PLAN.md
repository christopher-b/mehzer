# Mehzur: what is left

The app is built: house photo measurement for a small group of invited people, with projects, rooms, areas, CSV/PDF export, home-screen install, error handling and Docker deployment. How it works is in the [README](README.md) and [docs/](docs/); decisions are in [docs/decisions.md](docs/decisions.md).

## Done recently
- Multi-user phase 1: accounts, invite links, private projects, password reset by email, administrator page, sign-in limits (Docker). Plan and results: `docs/multi-user-plan.md`.
- Tried for real (25 Oct 2026): invite and account creation through Proton SMTP, the phone checklist (`docs/phone-test-checklist.md`, assumed passed), and the Safari browser suite (148 passed, 6 skipped).
- Deployed with Dokploy from the GitHub Container Registry image `ghcr.io/christopher-b/mehzur` (linux/amd64); the GitHub Actions workflow builds and publishes it.
- Icons in the menus (Lucide), corrected wordmark, wider account menu.

## Left to do
- [ ] M1 Multi-user phase 2: sharing a project between people (roles, Share option, "Shared with me"), passkeys, changing your email address. Decisions are in `docs/multi-user-plan.md`
- [ ] M3 Remove the vestigial Cloudflare support (see "Not planned" below). Files and settings to go: `wrangler.jsonc`, `.dev.vars.example`, `src/lib/server/db/d1.ts`, `src/lib/server/storage/r2.ts` (and its test), `services-cloudflare.ts` and the `services-*.ts` / `platform.ts` split, `@cloudflare/workers-types`, the `DEPLOY_TARGET` switch and `__DEPLOY_TARGET__` in `vite.config.ts`, the `*:cf` scripts (`build:cf`, `dev:cf`, `deploy:cf`, `db:migrate:cf`, `db:migrate:cf:local`) and `@sveltejs/adapter-cloudflare` in `package.json`, the Cloudflare section of `docs/deployment.md`, and the Cloudflare mentions in the README, `docs/architecture.md` and `docs/contributing.md`. Once it is gone, server code could use better-sqlite3 transactions (D1 has none)
- [ ] M2b Send a real password-reset email through Proton SMTP, and run migration 0003 on a copy of the real database (the invite email and account creation are done)

## Not planned
- Cloudflare deployment (Workers, D1, R2). It still compiles but has never been run with accounts, and it cannot send email. Docker is the only supported target (D46, D47).

## Future ideas (not scheduled)
- Rearrange rooms: let the user change the order of rooms on the project page (for example drag to reorder, or move up/down in the room menu). Rooms are shown in creation order everywhere today (a product decision in `docs/decisions.md`); this would need a stored position per room (a schema change and migration) and the same order used in the room filter and the photo page's "Change room" list
