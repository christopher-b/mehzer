# How the app works

For a map of the server addresses see [endpoints.md](endpoints.md).

## Project layout

```
src/app.css                 Design tokens (colours, radii, shadows) and global styles
src/hooks.server.ts         Finds the signed-in user from the session cookie, refuses signed-out requests; logs unexpected errors with an id
src/hooks.client.ts         Tags lost connections; ids for unexpected browser errors
src/lib/units.ts            Parse and format measurements (12' 6", 3.2m), areas, unit labels
src/lib/measurements.ts     How a measurement is named and labelled
src/lib/rooms.ts            Room area calculation
src/lib/image.ts            Browser-side photo resizing
src/lib/client/             Browser helpers: form-action calls, failure messages (errors.ts), notifications,
                            online state, drafts kept across sign-in, photo upload, remembered collapsed cards
src/lib/components/         AnnotationCanvas.svelte (draws and edits lines on a photo)
src/lib/components/ui/      Shared building blocks: PopupMenu, Modal, AddTile, HamburgerIcon, Notifications, SessionExpired
src/lib/server/db/          Drizzle schema, Node (SQLite) and D1 clients
src/lib/server/storage/     Photo storage: filesystem and R2
src/lib/server/             Platform selection, form parsing, messages, photo and room rules, and accounts:
                              password.ts (hashing), auth.ts (token hashing, cookie), sessions.ts, users.ts (accounts,
                              sign-in limits, deleting a user), invites.ts (invite and reset links), signin.ts,
                              email.ts (SMTP, Node build only)
src/routes/                 Pages and endpoints; each page's own components sit beside it
                            (for example src/routes/p/[id]/ for the project page and its photo page)
drizzle/                    SQL migrations, used by both Docker and D1
docker/server.js            Docker entry point
src/tests/                  Route and database tests (unit tests sit next to the code)
tests/e2e/                  Playwright browser tests; playwright.config.ts at the root
docs/                       Deployment, testing, endpoints, decisions, contributing, phone checklist
PLAN.md                     What is left to do
```

## Export

On a project page, the **Project menu** (hamburger button beside the project name in the header) shows the units and holds **Edit project**, **Export CSV** and **Export PDF**. The two exports download the rooms, their areas and their measurements (CSV for spreadsheets, PDF for reading or printing). The PDF also shows each photo with its measurement lines drawn on; the CSV is text only. A project with very many photos makes a large PDF, which is built in memory.

## Add to home screen

The app has a web manifest and icons, so on a phone you can add it to the home screen (iPhone: Share > Add to Home Screen; Android: Install app) and it opens full-screen without the address bar. It still needs a connection: there is no offline mode. To change the icon, replace the files in `static/` (`icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).

## Errors and feedback

- **Notifications:** problems that have no dialog open (a failed drag of an end point, a failed delete, a failed rename) appear in a small message at the bottom of the screen. Errors stay until you dismiss them and can have a **Retry** button; "Saved" and "Back online" disappear after a few seconds. Problems inside a dialog or menu appear inside it, and what you typed is kept.
- **Offline:** a banner says "You're offline" while the browser reports no connection. Nothing is disabled; an action tried offline says so and can be repeated once you reconnect. There is no offline mode: changes are not queued.
- **Session expiry:** if the session has expired when you save, a "Signed out" box offers **Sign in**. A measurement being typed or a room name being added is kept in the browser tab and put back after you sign in and return to the same page. Photos that were not uploaded are listed as "Not uploaded" so you can add them again.
- **Uploads:** each photo shows its progress and result under **Rooms**; a failed one can be retried on its own.

## Limits

No offline mode, no sharing of a project between people yet, no passkeys yet, email only on the Docker build, the CSV export has no photos, and room areas use exactly two measurements (no L-shaped rooms).
