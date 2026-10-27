# Mehzur: what is left

The app is built: house photo measurement for a small group of invited people, with projects, rooms, areas, CSV/PDF export, home-screen install, error handling and Docker deployment. How it works is in the [README](README.md) and [docs/](docs/); decisions are in [docs/decisions.md](docs/decisions.md).

## Done recently
- Multi-user phase 1: accounts, invite links, private projects, password reset by email, administrator page, sign-in limits (Docker). Plan and results: `docs/multi-user-plan.md`.
- Tried for real (25 Oct 2026): invite and account creation through Proton SMTP, the phone checklist (`docs/phone-test-checklist.md`, assumed passed), and the Safari browser suite (148 passed, 6 skipped).
- Deployed with Dokploy from the GitHub Container Registry image `ghcr.io/christopher-b/mehzur` (linux/amd64); the GitHub Actions workflow builds and publishes it.
- Icons in the menus (Lucide), corrected wordmark, wider account menu.
- The home page's create-project form is a dashed "+ Project" tile that opens a dialog (name, units, Create). Creating and editing a project share `ProjectForm.svelte`; adding and renaming a room share `RoomNameForm.svelte`. Each project on the list has the project menu (edit, share, export, leave, delete).
- M1 (done): passkeys (D50, migration 0006), bound to `APP_URL`; set it to the https address in Dokploy and do not change the domain later. Try one on a phone in production.
- M1 (part): changing your email address (D49, migration 0005): confirmed by an emailed link when email is set up, immediate otherwise.
- M1 (part): project sharing. Owner shares by email with existing accounts; guests edit but cannot delete, share or hand over; guests can leave; hand over swaps roles; "Shared with me" on the home page (D48, migration 0004).
- M3: removed the Cloudflare support (D1 and R2 code, `wrangler.jsonc`, `__DEPLOY_TARGET__`, the `:cf` scripts and packages). The `Db` type is now synchronous only; existing code still `await`s database calls and mostly avoids transactions (see `docs/decisions.md`).

## Left to do
- [ ] Try the email-change link through Proton SMTP (Account > Email address); password reset, passkeys and migration 0003 are confirmed in production
- [ ] `PasswordPair.svelte`: the "new password" and "confirm password" fields (`minlength`, `autocomplete="new-password"`) are repeated in `setup`, `invite/[token]`, `reset/[token]` and the change-password form on `account/+page.svelte`. Keep the label texts and the `password` and `confirm` field names, which the server actions and e2e tests rely on.
- [ ] Optional, small gain: the account page's profile name, passkey rename and new-passkey name are three similar inline "name + Save" forms; an `InlineNameForm` could cover them, but each has different wording and behaviour.
- [ ] Investigate and settle the naming of the dialog components. Today some are named for the thing and the action (`ProjectEditDialog`, `ProjectShareDialog`, `RoomRenameDialog`, `ChangeRoomDialog`, `MeasurementDialog`, which handles create and edit) while others start with the verb and are not called dialogs even though they are (`AddProject`, `AddRoom`, which are a tile plus a dialog). The shared forms are `ProjectForm` and `RoomNameForm`. Pick one rule (for example `<Thing><Action>Dialog`, with the tile and dialog split into `AddProjectTile` and `AddProjectDialog`), rename the files and imports to match, and write the rule in `docs/contributing.md`. Accessible names must not change (the e2e tests rely on them).
- Already shared, nothing to do: measurements use one `MeasurementDialog.svelte` for both create and edit (`mode` prop).

## Not planned
- Cloudflare deployment (Workers, D1, R2). Docker is the only supported target (D46, D47).

## Future ideas (not scheduled)
- Migrate email provider: move outgoing email from Proton SMTP to another provider (only the `SMTP_*` and `MAIL_FROM` settings should need to change; check the TLS rules in `src/lib/server/email.ts` and `docs/deployment.md`)
- Drop the leftover `await`s on database calls and wrap multi-step writes in transactions, now that only better-sqlite3 is supported
- Rearrange rooms: let the user change the order of rooms on the project page (for example drag to reorder, or move up/down in the room menu). Rooms are shown in creation order everywhere today (a product decision in `docs/decisions.md`); this would need a stored position per room (a schema change and migration) and the same order used in the room filter and the photo page's "Change room" list
