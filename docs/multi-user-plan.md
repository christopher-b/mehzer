# Mehzur: multi-user support, implementation plan

Status: all questions answered or defaulted (see "Answers" below). Phase 1 is being built; the
progress log is at the end.

## Answers (25 Oct 2026)

| # | Question | Answer | What it means for the plan |
|---|---|---|---|
| A1 | Who uses it | Selected acquaintances | Small, known group; invite-only; moderate hardening (rate limits, good hashing), no public sign-up |
| A2 | Sharing | Private projects, owners can share with others | Ownership in phase 1; sharing UI follows (see Q-S below for whether it ships in phase 1) |
| A3 | Accounts | Admin generates invite links | Invite table with single-use, expiring tokens; no temporary passwords |
| A4 | First admin | From `APP_PASSWORD` | On first start with no users, signing in with `APP_PASSWORD` creates the admin account (then asks for email and a real password) |
| A5 | Deleted user | Their projects are deleted | Deleting a user deletes their projects, photos (files too) and measurements; strong confirmation in the UI. Shares they received are removed |
| A6 | Password reset | Self-service by email, Proton SMTP | Email sending via SMTP (Proton Mail SMTP submission with a token); reset tokens single-use and short-lived. Invites can also be emailed |
| A7 | Login method | Passwords, ideally passkeys | Passwords in phase 1; passkeys (WebAuthn) as an addition on the account page, then as a sign-in option |
| A8 | Targets | Docker only for now | Node-only libraries are allowed (SMTP, WebAuthn, native hashing). The Cloudflare build will no longer work for multi-user; see Q-C |
| A9 | Who changed what | Record it, don't show it | `created_by` / `updated_by` on projects, rooms, photos and measurements; no UI |
| A10 | Ship | Phase 1 is enough | Ship accounts, invites, private projects, email reset; sharing and passkeys may follow (Q-S, Q-P) |

### Changes to the plan from these answers

- **U1 data model** adds: `invite` (`id`, `token_hash`, `email?`, `role`, `created_by`, `expires_at`,
  `used_at`, `used_by`), `password_reset` (`token_hash`, `user_id`, `expires_at`, `used_at`),
  `passkey` (`id`, `user_id`, `credential_id`, `public_key`, `counter`, `transports`, `name`,
  `created_at`, `last_used_at`), and `created_by` / `updated_by` columns on `project`, `room`,
  `photo`, `annotation` (nullable for existing rows, set to the first admin by the migration).
  Tokens are stored hashed (SHA-256); only the link holds the raw token.
- **U2 hashing**: Docker only, so Node's built-in `crypto.scrypt` (no new dependency) is a good
  choice; keep the hash format versioned (`scrypt$N$r$p$salt$hash`) so it can change later.
- **U5 sign-in pages** add: `/invite/<token>` (choose name and password, then signed in),
  `/forgot` (enter email; always answers "if that address has an account, we sent a link"),
  `/reset/<token>` (new password; signs out other sessions).
- **U6 admin** becomes: create invite link (optional email address and role, expiry 7 days, copy
  link or send by email), list and revoke unused invites, list users, disable, delete (deletes their
  projects; type the email to confirm). Admin cannot delete or disable themselves or the last admin.
- **New U9 email**: `src/lib/server/email.ts` using `nodemailer` (new runtime dependency) with
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `APP_URL` (the public
  address, for links in emails; must not be taken from the request's Host header). If SMTP is not
  configured, invites still work (copy the link) and "forgot password" says to contact the admin.
  Plain-text emails first. Log send failures with the error id, never the token.
- **New U10 passkeys** (if in scope, Q-P): `@simplewebauthn/server` and `@simplewebauthn/browser`
  (new dependencies). Register from `/account` (needs a password sign-in first); sign in with
  "Use a passkey" on `/login`. Relying-party id = the host in `APP_URL`; passkeys only work over
  https (or `localhost`), so a plain-http LAN install cannot use them.
- **U7 tests** add: invite flow (valid, expired, used, revoked), reset flow (unknown email gives the
  same answer, expired and reused tokens fail, other sessions end), SMTP mocked in unit tests,
  user deletion removes their projects and files, `created_by` set by every create action.
- **U8 docs**: deployment gains the SMTP and `APP_URL` settings and Proton SMTP notes; decisions
  record "Docker only for multi-user".

## Where the app is today

- One shared password (`APP_PASSWORD`). Signing in sets an HMAC-signed cookie `mehzur_session`
  holding only an expiry (`<expiry>.<signature>`, 30 days). There is no notion of who is signed in.
- `src/hooks.server.ts` checks the cookie on every request and sets `locals.authenticated`.
- Every signed-in request can read and change everything: all projects, rooms, photos, measurements,
  photo files (`/api/photos/<key>`), exports.
- Data: `project`, `room`, `photo`, `annotation` tables; no user table. Same code on SQLite (Docker)
  and D1 (Cloudflare); Drizzle migrations in `drizzle/`.
- Project-scoped lookups are already centralised in a few helpers (`getProjectOr404`,
  `getPhotoOr404`, `findRoomInProject`), which is the natural place to add access checks.

## Recommended scope (defaults, pending the questions)

- Accounts created by an admin (no public sign-up). Email or username plus password.
- Each project has an owner; projects are private to their owner. Sharing comes later (phase 2),
  but the data model allows it from the start.
- An admin role that can manage users. The first admin is created from `APP_PASSWORD` on first run.
- Existing projects are given to that first admin.

Estimated effort: phase 1 about 3 to 4 days including tests; sharing (phase 2) a further 2 to 3 days.

## Phase 1: accounts and private projects

### U1. Data model and migration
- New table `user`: `id`, `email` (unique, lower-cased), `name`, `password_hash`, `role`
  (`admin` | `member`), `created_at`, `disabled_at?`.
- New table `session` (if sessions are stored, see Q8): `id` (random), `user_id`, `expires_at`,
  `created_at`, `last_seen_at`, `user_agent?`.
- `project.owner_id` (not null after migration) referencing `user.id`.
- Prepare for sharing: a `project_member` table (`project_id`, `user_id`, `role`) can be added now
  or in phase 2 (Q3).
- Migration `0003`: create tables; create a placeholder admin row; set every project's `owner_id` to
  it. Must work identically on SQLite and D1 (no interactive transactions on D1; write it as plain
  statements). Test on a copy of real data and on local D1 (`db:migrate:cf:local`).

### U2. Passwords and sessions
- Hashing must run on both Node and Workers: PBKDF2-SHA256 via Web Crypto (no native bcrypt/argon2),
  with a per-user salt and a high iteration count; store as `pbkdf2$<iterations>$<salt>$<hash>` so
  the cost can be raised later. Constant-time comparison.
- Session: either keep the stateless signed cookie but add the user id (`<userId>.<expiry>.<sig>`),
  or move to database sessions so they can be revoked (sign out everywhere, disabling a user takes
  effect at once). Default: database sessions (Q8).
- Changing `SESSION_SECRET` still signs everyone out.
- Login rate limiting (Q10): per account and per IP, stored in the database (works on both targets).

### U3. Request handling
- `hooks.server.ts`: resolve the session to `locals.user` (`{ id, email, name, role }`) instead of
  `locals.authenticated`. Keep today's behaviour for signed-out requests (redirect pages, 401 for
  `/api/*` and scripted actions).
- `App.Locals` gains `user`; remove `authenticated`.
- Disabled users are treated as signed out.

### U4. Access control (the main risk)
- Every query that reads or changes data must be limited to projects the user may access. Rule of
  thumb: never look anything up by id alone; always through the project and the user.
- Change the central helpers to take the user: `getProjectOr404(db, user, id)`,
  `getPhotoOr404(db, user, projectId, photoId)`, `findRoomInProject` callers already pass a checked
  project. A project the user may not see returns 404, never 403, so ids do not leak.
- Places to update (each needs a test):
  - Home `load`: only the user's projects (and summaries); `?/create` sets `owner_id`.
  - Project page `load` and all its actions (`update`, `delete`, `createRoom`, `renameRoom`,
    `deleteRoom`, `setRoomArea`, `deletePhoto`).
  - Photo page `load` and all its actions (`create`, `update`, `move`, `delete`, `setRoom`,
    `deletePhoto`), including the neighbour lookup.
  - `POST /api/projects/<id>/photos`.
  - `GET /api/photos/<key>`: today serves any key to any signed-in user. Look up the photo row by
    `blob_key`, check its project, then stream. (Keys include the project id, but the check must use
    the database, not the key's text.)
  - `GET /p/<id>/export.csv` and `export.pdf`.
  - `GET /api/health`: admin only, or unchanged (Q12).
- Add a small helper used everywhere, for example `requireUser(locals)`, and an access function
  `canAccess(user, project, need: 'read' | 'write' | 'owner')` so phase 2 only changes one place.

### U5. Sign-in, sign-out and account pages
- `/login`: email (or username) and password; same `next` handling and safe-redirect rule as today.
- Header: show who is signed in (name or initials) with a small menu: Account, Users (admins),
  Sign out.
- `/account`: change own name and password (requires the current password). "Sign out of other
  devices" if sessions are stored.
- First-run: if there are no users, the existing `APP_PASSWORD` creates the first admin (Q6), or a
  one-time setup page / command creates it.

### U6. User management (admins)
- `/admin/users`: list users; add a user (name, email, temporary password or invite link, see Q5);
  reset a password; disable or re-enable; delete (Q7: what happens to their projects).
- Admins cannot remove the last admin or disable themselves.

### U7. Tests
- Unit/route tests: seed helpers gain users; every action and endpoint gets an "other user gets 404
  and nothing changes" test. Password hashing and verification; session expiry, revocation and
  disabled users; migration assigns existing projects.
- Browser tests: the setup step signs in as a test user (fixtures already save a session); add a
  second user and check isolation (cannot open, list or fetch photos of the other user's project);
  admin pages; sign-out-everywhere.
- Keep both SQLite and D1 builds green; run the migration on local D1.

### U8. Docs and deployment
- README "Single user" claim, `docs/decisions.md` (new decisions; "one shared password" changes),
  `docs/endpoints.md` (new pages, actions and access rules), `docs/architecture.md`,
  `docs/deployment.md` (first admin, `APP_PASSWORD` role, backups now hold accounts), `.env.example`,
  phone checklist (sign in as a named user).

## Phase 2: sharing and passkeys (decided, not built)

### Decisions (26 Oct 2026)

| Topic | Decision |
|---|---|
| Deleting a project | Only the owner can delete a project. Guests cannot |
| Who can be added | Only people who already have an account. Sharing does not send invites to new addresses |
| Ownership | An owner can hand the project over to another account. The previous owner stays on the project as a guest |
| Cloudflare | Out of scope for phase 2 (Docker only) |

### Roles

- **Owner:** one per project. Everything a guest can do, plus: delete the project, manage guests, and hand over ownership.
- **Guest:** added by the owner by email (must already have an account). Sees the project on the home page under "Shared with me". A guest can do everything the owner can do to the project's contents: add, edit and delete photos, rooms and measurements; rename rooms; and rename the project and change its units. A guest cannot delete the project, and cannot share it or hand it over.

### Build notes

- `project_member` (`project_id`, `user_id`, `added_at`, `added_by`); the owner stays in `project.owner_id`.
- Handing over: in one step, set `project.owner_id` to the new owner and add the previous owner as a
  guest. Only the current owner can do it; the new owner must already be a guest or have an account.
- Removing a guest removes access at once. Deleting an account removes its guest memberships; projects it owned are deleted with it (existing rule).
- `canAccess(user, project, need)` reads membership; `need: 'owner'` for delete, manage guests and hand over.
- Project menu gets "Share" (guests list, add by email, remove) and "Hand over" (owner only).
- Home page: "Shared with me" section, separate from the owner's own projects.
- Tests for owner, guest and stranger on every action, plus the hand-over and removal cases.
- Passkeys (U10) follow sharing, as before.

## Risks and notes

- One missed check leaks another user's data or photos. Mitigation: all lookups through the checked
  helpers, plus an isolation test per endpoint; review every `db.select` that does not start from a
  checked project.
- Photo URLs are cached by browsers for a year (`immutable`); with access checks they should become
  `private` (already) and must not be served by any shared cache or CDN.
- Workers CPU limits: PBKDF2 with a very high iteration count can exceed the free-plan CPU budget;
  pick a cost that fits (measure on a deployed Worker).
- Existing sessions are invalidated by the new cookie format; everyone signs in once.
- No email sending exists today; invites and password reset by email would add a provider (Q5, Q9).

## Answers, round 2 (25 Oct 2026) and decisions taken

| Question | Answer / decision |
|---|---|
| Admins | Only one admin for now (the account created from `APP_PASSWORD`); no second admin and members cannot create invites |
| Deleting your own account | Members may delete their own account. It deletes their projects, photos and measurements. Anything else they created that is kept (in other users' projects, once sharing exists) stays, shown as "deleted user" (the `created_by` / `updated_by` columns are set to null when the user is removed). The admin cannot delete their own account |
| Email sender | `mehzur@cbennell.com`, plain text |
| Public address | `https://mehzur.cbennell.com` (`APP_URL`), always https in production |
| Invite and reset expiry | 7 days for invites, 1 hour for password resets |
| Sessions | 30 days; changing or resetting a password signs out the user's other sessions |
| Sign-in identifier | Email address |
| Sharing in the first release | **Assumed: no.** Phase 1 only (private projects). Sharing is phase 2 |
| Passkeys | **Assumed: after the first release** (phase 2) |
| Cloudflare | **Assumed: keep the code building, stop documenting it as supported.** Only portable code is used (Web Crypto password hashing, no Node-only imports outside the Node-only email module) so the Cloudflare build keeps compiling |
| `/api/health` | Stays open to any signed-in user |

### Design choices made while building

- **Passwords:** PBKDF2-SHA256 (600,000 iterations) through Web Crypto, in a versioned string
  `pbkdf2-sha256$<iterations>$<salt>$<hash>`. Portable to Cloudflare, no new dependency.
- **Sessions:** a random 256-bit token in the cookie; the database stores only an HMAC of it (keyed
  with `SESSION_SECRET`, so changing the secret signs everyone out). Invite and reset tokens are
  stored the same way.
- **Orphaned projects:** existing projects have no owner after the migration (no placeholder user).
  When the first admin is created they are all given to that admin.
- **First admin:** while there are no users, `/login` redirects to `/setup`, which asks for the
  `APP_PASSWORD`, a name, an email and a real password. After that `/setup` answers 404.
- **Owner column:** `project.owner_id` is nullable in the database (SQLite cannot add a NOT NULL
  column without rebuilding the table, which would cascade-delete everything), and required in code.
- **Access:** every project lookup goes through the signed-in user; other people's projects are 404.
  The admin sees only their own projects (admin rights are for managing users).
- **Rate limiting:** failed sign-ins are recorded in the database; 5 failures per email or 20 per
  address in 15 minutes blocks further attempts for that key.
- **Email:** `nodemailer` over SMTP (Proton SMTP submission with an SMTP token), loaded only on the
  Node target. Without SMTP settings invites still work by copying the link, and "forgot password"
  tells the user to contact the admin.

## Original questions (1 to 10 answered above; 11 to 21 partly covered by "Still open")

Who and how
1. Who will use it: family and friends, a small team or company, or open to the public? (Sets how
   much hardening and self-service is needed.) Default: a small known group.
2. Roughly how many users and projects? Default: under 20 users.
3. Sharing model: private projects only; shared projects with members; or one shared pool where
   everyone sees everything but is signed in as themselves? Default: private now, sharing later.
4. If sharing: which roles (owner, editor, viewer)? Can ownership be transferred? Can an editor
   delete the project or only the owner?

Accounts
5. How are accounts created: admin adds them with a temporary password, invite links, or open
   sign-up (with or without approval)? Default: admin adds them.
6. How is the first admin created: from today's `APP_PASSWORD` on first start, a setup page shown
   when there are no users, or a command run on the server? Default: setup from `APP_PASSWORD`.
7. When a user is deleted, what happens to their projects: delete them, transfer to an admin, or
   block deletion until they are transferred? Default: transfer to the admin who deletes the user.
8. Revocable sessions (stored in the database, "sign out everywhere", disabling takes effect at once)
   or keep stateless cookies with a user id? Default: stored sessions.
9. Password reset: admin resets it, or self-service by email (needs an email provider and a sending
   domain)? Default: admin resets.
10. Login protection: rate limiting / lockout after failed attempts? Minimum password length?
    Default: rate limiting, 10-character minimum.
11. Sign in with email or a username? Default: email.

Login method
12. Passwords only, or also an outside login: Cloudflare Access, Google/GitHub/OIDC, magic links?
    (Cloudflare Access only works on the Cloudflare deployment; OIDC works on both.) Default:
    passwords only.
13. Should `/api/health` stay open to any signed-in user, become admin-only, or be public for an
    uptime monitor?

Existing data and deployment
14. Who owns the existing projects after the upgrade: the first admin? Default: yes.
15. Do both deployment targets (Docker and Cloudflare) need multi-user, or only one? Default: both.
16. Is a short period where everyone must sign in again acceptable at upgrade time? Default: yes.

Interface
17. What should the header show for the signed-in user (name, initials, email)? Where do account and
    admin pages live in the menus?
18. On the home page, should shared projects be listed separately ("Shared with me")?
19. Should the app record who made each change (for example "added by Anna" on measurements or
    photos)? This needs `created_by` columns. Default: not now.

Scope and priority
20. Is phase 1 (accounts, private projects, admin user management) enough to ship, with sharing
    later? Or is sharing the main reason for this work?
21. Any compliance needs (data export or deletion per user, audit log)? Default: none.

## Progress log

Phase 1 is built (25 Oct 2026). Checks at the end: type check clean; 362 unit tests; Chromium browser suite
160 passed, 4 skipped; Safari suite 146 passed, 6 skipped; Docker-style production build run against a local
SMTP server (setup, session, reset email and invite email through `nodemailer` all worked); both the Node and
Cloudflare builds compile.

| Step | Done | Notes |
|---|---|---|
| U1 Data model and migration | yes | `drizzle/0003_accounts.sql` (hand-edited: drizzle-kit leaves out `ON DELETE` on added columns). Tested on a database that already holds data (`src/lib/server/db/migrations.test.ts`) |
| U2 Passwords and sessions | yes | PBKDF2 (Web Crypto), hashed session tokens; sign-in limits in the database |
| U3 Request handling | yes | `hooks.server.ts` resolves `locals.user`; public prefixes `/invite/`, `/reset/` |
| U4 Access control | yes | `getProjectOr404(db, userId, id)`, `getPhotoOr404(db, userId, ...)`, photo files looked up by key in the database; isolation tests for every route (`src/tests/isolation.test.ts`) and a two-person browser test |
| U5 Sign-in, sign-out, account pages | yes | `/login`, `/setup`, `/forgot`, `/reset/<token>`, `/invite/<token>`, `/account`, account menu in the header |
| U6 User management | yes | `/admin/users`: invite (copy link or email), revoke, reset link, disable/enable, delete with typed confirmation |
| U7 Tests | yes | Unit, route, isolation, migration and browser tests; every old test updated for accounts |
| U8 Docs | yes | README, `docs/decisions.md` (D37 to D46), `docs/endpoints.md`, `docs/architecture.md`, `docs/deployment.md`, phone checklist |
| U9 Email | yes | `src/lib/server/email.ts`; TLS required for remote SMTP; Proton settings in the deployment doc. Invite email and account creation tried against real Proton SMTP (25 Oct 2026); the reset email is not yet |
| U10 Passkeys | no | Phase 2 |
| U12 Change email | yes (26 Oct 2026) | `drizzle/0005_email_change.sql`, `src/lib/server/emailChange.ts`, `/account/email/<token>`; D49. Tests: `src/tests/email-change.test.ts`, `tests/e2e/account.spec.ts`. The emailed-link path is covered with a fake mailer only; try it once through real Proton SMTP |
| U11 Sharing | yes (26 Oct 2026) | `drizzle/0004_sharing.sql`, `src/lib/server/sharing.ts`, `ProjectSharePanel.svelte`; decisions as in the table above (D48). Tests: `sharing.test.ts`, a guest section in `isolation.test.ts`, `tests/e2e/sharing.spec.ts` |
| Sharing | no | Phase 2 |

### Changed from the plan

- Sessions are stored in the database and revocable, as planned; the cookie holds only a random token.
- Failed-sign-in limiting uses one table, also used for "forgot password" requests and the setup page.
- The administrator can make a reset link for a person (useful without email); this was not in the first plan.
- The 500 error-page browser test now fakes the server's real answer shape and so also checks the error id.

### Left for later

Sharing a project between people (roles, a Share option, "Shared with me"); passkeys;
changing your email address; an admin-visible list of who made what (the data is recorded already).
