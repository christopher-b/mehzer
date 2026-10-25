# Mehzer: what is left

The app is built: single-user house photo measurement with projects, rooms, areas, CSV/PDF export, home-screen install, error handling, Docker and Cloudflare deployment. How it works is in the [README](README.md) and [docs/](docs/); decisions are in [docs/decisions.md](docs/decisions.md).

## Left to do
- [ ] L3 Test the deploys. Done: Docker Compose behind Traefik, built and run on arm64 (see `docs/deployment.md`). Still to do: a real Cloudflare deploy (D1 migrations including 0002, R2, secrets, Workers logs, the install and export features) and an amd64 Docker image build and run
- [ ] L5 Real-phone checks with `docs/phone-test-checklist.md` (needs a person with a phone), especially the camera sheet, number pad, touch dragging, the "Calculate" button that was once reported as invisible, home-screen install and export

## Future ideas (not scheduled)
- Rearrange rooms: let the user change the order of rooms on the project page (for example drag to reorder, or move up/down in the room menu). Rooms are shown in creation order everywhere today (a product decision in `docs/decisions.md`); this would need a stored position per room (a schema change and migration) and the same order used in the room filter and the photo page's "Change room" list
