# Decisions and design notes

## Product decisions

- Accounts: email and password, created by invite link from the single administrator; projects are private to their owner unless the owner shares them with other existing accounts (D48). (Until Oct 2026 the app had one shared password.) Online only (no offline mode).
- Units are per project; measurements are stored in mm and shown as ft/in or m/cm.
- Every photo belongs to one room or to "No room"; a measurement's room is always its photo's room.
- A room's area is length × width from exactly two of its measurements: no L-shaped rooms and no manual entry.
- Unnamed measurements are called "Measurement x", where x is the position within its own photo (creation order).
- Photo numbers are the photo's position among the project's photos (oldest first); rooms are shown in creation order everywhere.
- Wording: lowercase "No room"; "ft/in" and "m/cm".
- Dropped on purpose: zoom and pan, bigger phone tap targets, in-app delete confirmations (the browser's `confirm()` stays), photo names and captions (the `caption` column is kept but unused).
- Dark mode is not a feature: the app is light only.

## Technical decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | SvelteKit (Svelte 5, TS) | User requirement |
| D2 | SQLite via Drizzle ORM, better-sqlite3 in Docker (it also ran on D1 on Cloudflare until D47) | Same schema/queries on both targets |
| D3 | Blob storage interface; photos on the local filesystem in Docker (R2 on Cloudflare until D47) | Photos too large for DB |
| D4 | ~~Adapter selected at build: `adapter-cloudflare` vs `adapter-node` via env `DEPLOY_TARGET`~~ (Cloudflare support removed, D47) | One codebase |
| D5 | Platform services injected in `hooks.server.ts` into `event.locals` (`db`, `storage`) | Isolate platform differences |
| D6 | Point coords stored normalized (0–1) relative to image | Resolution-independent rendering |
| D7 | Overlay drawn as SVG over `<img>` with viewBox = natural size | Crisp, easy hit-testing, responsive |
| D8 | Measurements stored canonically in mm; displayed in project unit | Unit switching without data loss |
| D9 | Client-side image downscale (max ~2560px, JPEG) before upload | Mobile photos are large |
| D10 | Auth: `APP_PASSWORD` env, HMAC-signed cookie (`SESSION_SECRET`) | Simple, works on both runtimes (Web Crypto) |
| D11 | Node 24 pinned via `mise.toml` | SvelteKit 3 requires Node ≥ 22.17 |
| D12 | ~~SvelteKit 3: adapter configured in `vite.config.ts`; `__DEPLOY_TARGET__` compile-time constant~~ (Cloudflare support removed, D47) | Lets M2 dynamically import only the right platform code (keeps better-sqlite3 out of the CF bundle) |
| D13 | ~~One migrations folder `drizzle/` used by both Node migrator (on startup) and `wrangler d1 migrations apply`~~ (Cloudflare support removed, D47) | Single source of truth |
| D14 | IDs are UUID text (`crypto.randomUUID`), timestamps `timestamp_ms` | Works on both runtimes |
| D15 | ~~Cloudflare config in `wrangler.jsonc` (Workers + static assets)~~ (Cloudflare support removed, D47) | Current Cloudflare recommendation over Pages |
| D16 | SvelteKit 3 conventions: `#lib/...ts` imports (explicit `.ts`), env vars declared in `src/env.ts` and read from `$app/env/private`, `Handle` from `@sveltejs/kit/hooks` | `$lib` and `$env/*` are removed/deprecated in Kit 3 |
| D17 | ~~CF bindings come from `import { env } from 'cloudflare:workers'` (not `event.platform`); runtime services live in `services-node.ts` / `services-cloudflare.ts`, loaded by `platform.ts`~~ (Cloudflare support removed, D47) | Kit 3 adapter-cloudflare dropped `platform.env`; separate modules keep each runtime's imports out of the other's bundle |
| D18 | Auth session token = `<expiry>.<HMAC-SHA256>` (30 days), password compared via HMAC digests | Stateless, no DB table, constant-time comparison |
| D19 | `/api/*` returns 401 when signed out; pages redirect to `/login?next=` | API clients get a status code, browsers get a redirect |
| D20 | Photos belong to at most one room (`photo.room_id`, null = "No room" group); deleting a room moves its photos to No room (`ON DELETE SET NULL`, migration `0001_photo_room.sql` edited by hand because drizzle-kit omitted the clause) | A room only shows its own photos; each room (and No room) has its own Take photo / Upload. A measurement's own room stays independently editable |
| D21 | A measurement has no room of its own; its room is always its photo's room. Moving a photo ("Change room" on the photo page) moves its measurements and clears any room area built from them (`setPhotoRoom` in `src/lib/server/photos.ts`) | Single source of truth; a photo and its measurements can never disagree. Migration `0002_annotation_room_from_photo.sql` drops `annotation.room_id`, first moving unassigned photos into their measurements' room and backing up/restoring rooms' area selections across the table rebuild |
| D22 | Docker image: multi-stage on `node:24-bookworm-slim`; the build stage installs python3/make/g++ because better-sqlite3 v13 compiles from source (no prebuilt binary); runtime stage has only production `node_modules`, `build/`, `drizzle/`, runs as the non-root `node` user, data in the `/data` volume (`DATABASE_PATH`, `PHOTOS_PATH`), migrations run on start, `BODY_SIZE_LIMIT=20M`, HEALTHCHECK on `/login` | Small runtime image (about 53 MB on top of the Node base), no secrets baked in |
| D23 | `docker/server.js` wraps the adapter-node server; `PLAIN_HTTP=true` (default in compose) makes it treat every request as http by always overwriting `X-Forwarded-Proto` | Kit 3 adapter-node assumes https and rejects form posts otherwise ("Cross-site POST form submissions are forbidden"); the old `ORIGIN` variable is gone and `paths.origin` is build-time only. Behind an https proxy use `PLAIN_HTTP=false` + `PROTOCOL_HEADER=x-forwarded-proto` instead |
| D24 | Session cookie `Secure` flag is set explicitly from the request protocol (`setSessionCookie(cookies, token, secure)`) | Kit forces `Secure` on every origin except http://localhost, and browsers drop Secure cookies on plain http, so login over a LAN address would silently fail |
| D25 | ~~Cloudflare deploy via `wrangler.jsonc` (D1 + R2 bindings), secrets via `wrangler secret put`, migrations via `wrangler d1 migrations apply` (same `drizzle/` folder as Docker); `database_id` in `wrangler.jsonc` is a placeholder to fill in~~ (Cloudflare support removed, D47) | Documented in README |
| D26 | one shared design-token stylesheet (`src/app.css`); components keep only layout styles | Keeps one way of doing it across the app |
| D27 | shared UI building blocks live in `src/lib/components/ui/`; page-specific components sit next to their page | Keeps one way of doing it across the app |
| D28 | "+ Room" and the photo "+" tile share one dashed-tile look (`AddTile`), so "+ Room" gained the tile's hover | Keeps one way of doing it across the app |
| D29 | tests call routes through `call`/`callLoad` and find browser elements by role first, CSS class only where no role exists | Keeps one way of doing it across the app |
| D30 | messages by kind (offline, network, session, not-found, server, validation) live in one table in `src/lib/client/errors.ts`; validation text is the server's own and stays where it was | Keeps one way of doing it across the app |
| D31 | failures inside a dialog, popover or menu show inline and keep the input; failures with nothing open use a notification; success notifications only where the result is not already visible | Keeps one way of doing it across the app |
| D32 | scripted requests that find no session get a 401 action result instead of a redirect; plain form posts keep the redirect | Keeps one way of doing it across the app |
| D33 | unexpected errors are logged as one JSON line with an id (never request bodies, cookies or the password) and the user sees only a generic message plus that id | Keeps one way of doing it across the app |
| D34 | `src/hooks.client.ts` tags requests that got no response, so a lost connection can be told apart from a bad response (SvelteKit otherwise reports both as "Internal Error") | Keeps one way of doing it across the app |
| D35 | the error page's link back to a project says "Back to project", not the project's name, because naming it would need an extra database query on every project page | Keeps one way of doing it across the app |
| D36 | the "one of three uploads fails, then Retry" browser test is skipped in WebKit: Playwright's WebKit drops the body of an upload it intercepts | Keeps one way of doing it across the app |
| D37 | Passwords are hashed with PBKDF2-SHA256 (600,000 iterations) through Web Crypto, stored as `pbkdf2-sha256$<iterations>$<salt>$<hash>` | Portable to Cloudflare, no native dependency; the cost can be raised later |
| D38 | Sessions are random tokens in the cookie; the database stores only an HMAC of the token (keyed with `SESSION_SECRET`). Same for invite and reset links | A copy of the database cannot be used to sign in; changing the secret voids everything |
| D39 | `project.owner_id` is nullable in the database; every project lookup goes through `getProjectOr404(db, userId, id)`, which answers 404 for other people's projects. The administrator sees only their own projects | SQLite cannot add a NOT NULL column to a table that has rows; 404 rather than 403 so ids do not leak |
| D40 | Existing projects have no owner after migration 0003; the first administrator (created at `/setup` with `APP_PASSWORD`) is given all of them | No placeholder user is needed |
| D41 | `created_by` / `updated_by` on projects, rooms, photos and measurements are recorded but not shown; they become null when the user is deleted (to be shown as "deleted user") | Ready for sharing; still not shown |
| D42 | Deleting an account (own, or by the administrator) deletes that person's projects, photos and measurements | Chosen over keeping or transferring them |
| D43 | One administrator; members cannot invite. Invites expire after 7 days, reset links after 1 hour; both are single use | Small known group |
| D44 | Email is sent with `nodemailer` over SMTP on the Node build only (loaded dynamically, so the Cloudflare bundle does not contain it). Without SMTP settings, invites are shared by copying the link | Keeps the Cloudflare build compiling; email is optional |
| D45 | Failed sign-ins are recorded in the database and limited per email (5) and per visitor address (50) per 15 minutes; "forgot password" requests are limited per address and always give the same answer | Guessing and email-flooding limits that work without extra services |
| D46 | Multi-user is supported on Docker only for now; the Cloudflare build still compiles but is untested with accounts and cannot send email | Chosen scope |
| D47 | Cloudflare deployment is not planned and its code was removed (PLAN.md, M3): `wrangler.jsonc`, the D1 and R2 code, `__DEPLOY_TARGET__`, the `:cf` scripts and the Cloudflare packages. Docker, run from the published image, is the only supported target. Supersedes D4, D12, D13, D15, D17 and D25 | Accounts, email and later passkeys use Node-only libraries; one target is simpler to test |
| D48 | Project sharing: a `project_member(project_id, user_id, added_at, added_by)` table lists guests; the owner stays in `project.owner_id`. `getProjectOr404(db, userId, id, need?)` returns the project with `role` (`owner` or `guest`): strangers get 404, a guest asking for an owner-only action (delete, share, unshare, hand over) gets 403. Guests can edit photos, rooms, measurements, rename the project and change its units, and can leave. Only people with an enabled account can be added (by email; nobody is invited). Hand over makes a guest the owner and the previous owner a guest, in one transaction. Deleting an account deletes the projects it owns (even if shared) and removes its guest rows. The home page lists shared projects under "Shared with me" | Small known group; one owner keeps deletion and sharing simple |

## Data model

- user(id, email, name, password_hash, role admin|member, created_at, disabled_at?)
- session(id, user_id, token_hash, user_agent?, created_at, last_seen_at, expires_at)
- invite(id, token_hash, email?, created_by?, expires_at, used_at?, used_by?, revoked_at?)
- password_reset(id, user_id, token_hash, expires_at, used_at?)
- login_attempt(id, key, at): failed sign-ins and password-reset requests, counted over a 15-minute window
- project_member(project_id, user_id, added_at, added_by?): guests; primary key (project_id, user_id)
- project(id, owner_id?, name, unit_system, created_at, created_by?, updated_by?)
- photo(id, project_id, room_id?, blob_key, width, height, caption, created_at, created_by?, updated_by?)
- room(id, project_id, name, area_a_annotation_id?, area_b_annotation_id?, created_at, created_by?, updated_by?)
- annotation(id, photo_id, name?, x1, y1, x2, y2, value_mm, created_at, created_by?, updated_by?)
- A measurement has no room of its own: its room is always its photo's room (`photo.room_id`).
- Area is computed on read: a.value × b.value (null if either is missing, or no longer on a photo in the room).

## Annotation interaction

1. Tap point A (a marker shows), then tap point B: the line is drawn and the measurement dialog opens.
2. Imperial input accepts `12' 6"`, `12.5ft`, `150in`, `6 1/2"`; metric accepts `3.2m`, `320cm`, `3200mm`; a bare number means feet (imperial) or metres (metric).
3. Cancel removes the draft; Esc clears point A.
4. Drag a line's end points to adjust it. Left/Right arrow keys flip photos within a room.

## Left alone on purpose

- **`AnnotationCanvas.svelte`**: one cohesive concept (drawing and editing lines on a photo); splitting it would scatter the pointer logic.
- **`Db` type with `any`** (`src/lib/server/db/types.ts`): the schema generic is `any`-typed; the type is now only the synchronous better-sqlite3 database.
- **Few database transactions**: multi-step writes (delete project then files, move photo then clear areas) were written for D1, which has no interactive transactions, so they are ordered so that a failure leaves a harmless state. Transactions are possible now; wrap them if a new write needs it.
- **Service wiring** (`platform.ts`): tiny, and proven by building and running the app; not unit-tested on purpose.
- **Repeated project/photo lookups per action**: negligible cost for one user; keeps every action safe on its own.
- **Dependency audit**: production dependencies have no known vulnerabilities. The reported advisories are in development tools only (drizzle-kit, esbuild's dev server); `npm audit fix --force` would downgrade them to old majors. Revisit when those tools update; do not force-fix.

## Known limitations

- The 500 error page is tested end to end with a faked failed page-data answer (a real server fault cannot be made on demand); the error id itself is made by `handleError`, covered by its unit tests.
- Passkeys and sharing a project between people are not built yet; Cloudflare support is not planned (D47).
- The "one of three uploads fails, then Retry" browser test is skipped in WebKit (D36); a test that fails all three uploads covers Retry there.
- Real-phone behaviour (camera sheet, number pad, touch drag) is only covered by the manual list in `phone-test-checklist.md`; Playwright's WebKit is Safari's engine, not iOS Safari.
- No Firefox. CI (GitHub Actions) runs the type check and unit tests, not the browser tests.
- The PDF export is built in memory, so a project with very many large photos uses a lot of server memory.
