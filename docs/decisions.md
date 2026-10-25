# Decisions and design notes

## Product decisions

- One shared password, no accounts; online only (no offline mode).
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
| D2 | SQLite via Drizzle ORM: D1 on Cloudflare, better-sqlite3 in Docker | Same schema/queries on both targets |
| D3 | Blob storage interface: R2 on CF, local filesystem in Docker | Photos too large for DB |
| D4 | Adapter selected at build: `adapter-cloudflare` vs `adapter-node` via env `DEPLOY_TARGET` | One codebase |
| D5 | Platform services injected in `hooks.server.ts` into `event.locals` (`db`, `storage`) | Isolate platform differences |
| D6 | Point coords stored normalized (0–1) relative to image | Resolution-independent rendering |
| D7 | Overlay drawn as SVG over `<img>` with viewBox = natural size | Crisp, easy hit-testing, responsive |
| D8 | Measurements stored canonically in mm; displayed in project unit | Unit switching without data loss |
| D9 | Client-side image downscale (max ~2560px, JPEG) before upload | Mobile photos are large |
| D10 | Auth: `APP_PASSWORD` env, HMAC-signed cookie (`SESSION_SECRET`) | Simple, works on both runtimes (Web Crypto) |
| D11 | Node 24 pinned via `mise.toml` | SvelteKit 3 requires Node ≥ 22.17 |
| D12 | SvelteKit 3: adapter configured in `vite.config.ts`; `__DEPLOY_TARGET__` compile-time constant | Lets M2 dynamically import only the right platform code (keeps better-sqlite3 out of the CF bundle) |
| D13 | One migrations folder `drizzle/` used by both Node migrator (on startup) and `wrangler d1 migrations apply` | Single source of truth |
| D14 | IDs are UUID text (`crypto.randomUUID`), timestamps `timestamp_ms` | Works on both runtimes |
| D15 | Cloudflare config in `wrangler.jsonc` (Workers + static assets) | Current Cloudflare recommendation over Pages |
| D16 | SvelteKit 3 conventions: `#lib/...ts` imports (explicit `.ts`), env vars declared in `src/env.ts` and read from `$app/env/private`, `Handle` from `@sveltejs/kit/hooks` | `$lib` and `$env/*` are removed/deprecated in Kit 3 |
| D17 | CF bindings come from `import { env } from 'cloudflare:workers'` (not `event.platform`); runtime services live in `services-node.ts` / `services-cloudflare.ts`, loaded by `platform.ts` | Kit 3 adapter-cloudflare dropped `platform.env`; separate modules keep each runtime's imports out of the other's bundle |
| D18 | Auth session token = `<expiry>.<HMAC-SHA256>` (30 days), password compared via HMAC digests | Stateless, no DB table, constant-time comparison |
| D19 | `/api/*` returns 401 when signed out; pages redirect to `/login?next=` | API clients get a status code, browsers get a redirect |
| D20 | Photos belong to at most one room (`photo.room_id`, null = "No room" group); deleting a room moves its photos to No room (`ON DELETE SET NULL`, migration `0001_photo_room.sql` edited by hand because drizzle-kit omitted the clause) | A room only shows its own photos; each room (and No room) has its own Take photo / Upload. A measurement's own room stays independently editable |
| D21 | A measurement has no room of its own; its room is always its photo's room. Moving a photo ("Change room" on the photo page) moves its measurements and clears any room area built from them (`setPhotoRoom` in `src/lib/server/photos.ts`) | Single source of truth; a photo and its measurements can never disagree. Migration `0002_annotation_room_from_photo.sql` drops `annotation.room_id`, first moving unassigned photos into their measurements' room and backing up/restoring rooms' area selections across the table rebuild |
| D22 | Docker image: multi-stage on `node:24-bookworm-slim`; the build stage installs python3/make/g++ because better-sqlite3 v13 compiles from source (no prebuilt binary); runtime stage has only production `node_modules`, `build/`, `drizzle/`, runs as the non-root `node` user, data in the `/data` volume (`DATABASE_PATH`, `PHOTOS_PATH`), migrations run on start, `BODY_SIZE_LIMIT=20M`, HEALTHCHECK on `/login` | Small runtime image (about 53 MB on top of the Node base), no secrets baked in |
| D23 | `docker/server.js` wraps the adapter-node server; `PLAIN_HTTP=true` (default in compose) makes it treat every request as http by always overwriting `X-Forwarded-Proto` | Kit 3 adapter-node assumes https and rejects form posts otherwise ("Cross-site POST form submissions are forbidden"); the old `ORIGIN` variable is gone and `paths.origin` is build-time only. Behind an https proxy use `PLAIN_HTTP=false` + `PROTOCOL_HEADER=x-forwarded-proto` instead |
| D24 | Session cookie `Secure` flag is set explicitly from the request protocol (`setSessionCookie(cookies, token, secure)`) | Kit forces `Secure` on every origin except http://localhost, and browsers drop Secure cookies on plain http, so login over a LAN address would silently fail |
| D25 | Cloudflare deploy via `wrangler.jsonc` (D1 + R2 bindings), secrets via `wrangler secret put`, migrations via `wrangler d1 migrations apply` (same `drizzle/` folder as Docker); `database_id` in `wrangler.jsonc` is a placeholder to fill in | Documented in README |
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

## Data model

- project(id, name, unit_system, created_at)
- photo(id, project_id, room_id?, blob_key, width, height, caption, created_at)
- room(id, project_id, name, area_a_annotation_id?, area_b_annotation_id?)
- annotation(id, photo_id, name?, x1, y1, x2, y2, value_mm, created_at)
- A measurement has no room of its own: its room is always its photo's room (`photo.room_id`).
- Area is computed on read: a.value × b.value (null if either is missing, or no longer on a photo in the room).

## Annotation interaction

1. Tap point A (a marker shows), then tap point B: the line is drawn and the measurement dialog opens.
2. Imperial input accepts `12' 6"`, `12.5ft`, `150in`, `6 1/2"`; metric accepts `3.2m`, `320cm`, `3200mm`; a bare number means feet (imperial) or metres (metric).
3. Cancel removes the draft; Esc clears point A.
4. Drag a line's end points to adjust it. Left/Right arrow keys flip photos within a room.

## Left alone on purpose

- **`AnnotationCanvas.svelte`**: one cohesive concept (drawing and editing lines on a photo); splitting it would scatter the pointer logic.
- **`Db` type with `any`** (`src/lib/server/db/types.ts`): needed to accept both the synchronous (better-sqlite3) and asynchronous (D1) Drizzle databases.
- **No database transactions**: D1 has no interactive transactions, so multi-step writes (delete project then files, move photo then clear areas) are ordered so a failure leaves a harmless state.
- **Platform wiring** (`platform.ts`, `services-*.ts`, `db/d1.ts`): tiny, and proven by building and running both targets; not unit-tested on purpose.
- **Repeated project/photo lookups per action**: negligible cost for one user; keeps every action safe on its own.
- **Dependency audit**: production dependencies have no known vulnerabilities. The reported advisories are in development tools only (Wrangler's emulator, drizzle-kit, esbuild's dev server); `npm audit fix --force` would downgrade them to old majors. Revisit when those tools update; do not force-fix.

## Known limitations

- The error id on the 500 page is covered by the `handleError` unit tests, not end to end (a real server fault cannot be made on demand).
- The "one of three uploads fails, then Retry" browser test is skipped in WebKit (D36); a test that fails all three uploads covers Retry there.
- Real-phone behaviour (camera sheet, number pad, touch drag) is only covered by the manual list in `phone-test-checklist.md`; Playwright's WebKit is Safari's engine, not iOS Safari.
- No Firefox, no CI.
- The PDF export is built in memory, so a project with very many large photos could hit the Workers memory limit.
