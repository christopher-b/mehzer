# Mehzur: what is left

The app is built: single-user house photo measurement with projects, rooms, areas, CSV/PDF export, home-screen install, error handling, Docker and Cloudflare deployment. How it works is in the [README](README.md) and [docs/](docs/); decisions are in [docs/decisions.md](docs/decisions.md).

## Done recently
- Multi-user phase 1: accounts, invite links, private projects, password reset by email, administrator page, sign-in limits (Docker). Plan and results: `docs/multi-user-plan.md`.

## Left to do
- [ ] M1 Multi-user phase 2: sharing a project between people (roles, Share option, "Shared with me"), passkeys, accounts on Cloudflare, changing your email address
- [ ] M2 Try the multi-user build for real: run migration 0003 on a copy of your real database, send a real invite and reset email through Proton SMTP, and use it on a phone (the new section 1 of the phone checklist)
- [ ] L3 Test the deploys. Done: Docker Compose behind Traefik, built and run on arm64 (see `docs/deployment.md`). Still to do: a real Cloudflare deploy (D1 migrations including 0002, R2, secrets, Workers logs, the install and export features) and an amd64 Docker image build and run
- [ ] L5 Real-phone checks with `docs/phone-test-checklist.md` (needs a person with a phone), especially the camera sheet, number pad, touch dragging, the "Calculate" button that was once reported as invisible, home-screen install and export

## Future ideas (not scheduled)
- Rearrange rooms: let the user change the order of rooms on the project page (for example drag to reorder, or move up/down in the room menu). Rooms are shown in creation order everywhere today (a product decision in `docs/decisions.md`); this would need a stored position per room (a schema change and migration) and the same order used in the room filter and the photo page's "Change room" list
