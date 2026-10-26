# Server endpoints

Signed-in addresses need a session (a random token in the `mehzur_session` cookie, looked up in the database). Signed out, pages redirect to `/login?next=<page>`, `/api/*` answers `401`, and scripted form calls (from the app's own JavaScript) get a `401` the app turns into a "Signed out" prompt.

**Public** (no session): `/login`, `/setup` (only while there are no accounts), `/forgot`, `/invite/<token>`, `/reset/<token>`, and the home-screen install files.

**Whose data:** every project, photo, measurement and export address is limited to the signed-in person's own projects. Someone else's project, photo or file answers `404`, exactly like one that does not exist. Only the administrator can use `/admin/*` (everyone else gets `404`).

"Form actions" are `POST` requests to the page address with `?/<name>` and form fields, for example `POST /p/<id>?/createRoom`. The app calls them with JavaScript; they also work as plain form posts. A failed check answers `400` with an `error` message; a missing item answers `404`.

## Pages

| Address | What it does |
|---|---|
| `GET /` | Home: your projects (newest first) with photo count, room count and total calculated area |
| `GET /login` | Sign-in form (email and password). Redirects to `/setup` while there are no accounts. Public |
| `GET /setup` | First-run page: creates the administrator, using `APP_PASSWORD` as the setup password. `404` once any account exists. Public |
| `GET /forgot` | Ask for a password-reset email. Public |
| `GET /reset/<token>` | Choose a new password from an emailed (or administrator-made) link. Public |
| `GET /invite/<token>` | Create an account from an invite link. Public |
| `GET /account/email/<token>` | Confirm a new email address from the emailed link: shows the new address and a button; works only while signed in as that account |
| `GET /account` | Your name, email address, password, other devices, and (members only) deleting your account |
| `GET /admin/users` | The administrator's page: invite people, see who is waiting, disable, delete, make reset links |
| `GET /p/<id>` | Project page: rooms, photos, measurements and areas |
| `GET /p/<id>/photo/<photoId>` | Photo page: draw and edit measurements; previous and next photo in the same room |
| any other address | A friendly "Page not found" page. Server faults show "Something went wrong" with an error id and are logged |

## Downloads and API

| Address | What it does |
|---|---|
| `GET /p/<id>/export.csv` | CSV of the project: one row per measurement (room, room area, photo, measurement, value, value in mm) |
| `GET /p/<id>/export.pdf` | PDF of the project: each room's photos with the measurement lines drawn on, and the measurements listed |
| `GET /api/photos/<key>` | The photo file, only if the photo belongs to a project you own or are a guest on (the key is looked up in the database; served with long-lived private caching; keys are never reused) |
| `POST /api/projects/<id>/photos` | Upload one photo (multipart: `file` as JPEG, PNG or WebP up to 15 MB, `width`, `height`, optional `roomId`). Answers `201` with the new photo. Errors are JSON `{ message }` |
| `GET /api/health` | Checks the database and photo storage; answers `{ db, storage }` |
| `POST /logout` | Ends this session (removed from the database) and redirects to `/login` |
| `GET /manifest.webmanifest`, `/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png` | Home-screen install files. Public (no session needed) |
| `GET /robots.txt` | Crawler rules (allows everything; the pages are behind the sign-in anyway) |

## Form actions

### Accounts (public pages)
| Action | Fields | What it does |
|---|---|---|
| `POST /login` | `email`, `password`, optional `next` in the address | Checks them, starts a session, redirects to `next` (only addresses inside the app are accepted). `400` for a wrong email or password (one message for both), `429` after too many failures |
| `POST /setup` | `setupPassword`, `name`, `email`, `password`, `confirm` | Creates the administrator, claims projects from before accounts, signs in. `404` once an account exists |
| `POST /forgot` | `email` | Emails a reset link if the address has an account; the answer is the same either way. Limited to 5 requests per address per 15 minutes |
| `POST /reset/<token>` | `password`, `confirm` | Sets the new password (single-use link, valid 1 hour), signs out every other session, signs in |
| `POST /invite/<token>` | `name`, `email` (fixed if the invite names one), `password`, `confirm` | Creates a member account (single-use link, valid 7 days) and signs in |

### `/account/email/<token>`
| Action | Fields | What it does |
|---|---|---|
| `default` | none | Applies the pending change (single use), signs out your other devices, and emails a notice to the old address |

### `/account`
| Action | Fields | What it does |
|---|---|---|
| `?/profile` | `name` | Changes your name |
| `?/email` | `email`, `current` | Changes your email address. With email set up it sends a one-hour link to the new address and changes nothing until it is used (limited to 5 requests per 15 minutes); without email it changes at once. Needs your current password; refuses an address that already has an account |
| `?/password` | `current`, `password`, `confirm` | Changes your password (needs the current one); signs out your other devices |
| `?/signOutOthers` | none | Signs out every other device |
| `?/deleteAccount` | `confirmEmail`, `current` | Members only: deletes your account and all the projects you own (even if shared), with their photos and measurements |

### `/admin/users` (administrator only)
| Action | Fields | What it does |
|---|---|---|
| `?/invite` | optional `email`, optional `send` | Makes an invite link (shown once); emails it when asked and email is set up |
| `?/revoke` | `inviteId` | Cancels an unused invite |
| `?/resetLink` | `userId` | Makes a one-hour reset link for that person (and emails it if email is set up) |
| `?/disable`, `?/enable` | `userId` | Disabling signs the person out everywhere and blocks sign-in; not for yourself |
| `?/delete` | `userId`, `confirmEmail` | Deletes the person and all the projects they own, with their photos and measurements; not for yourself |

### `/` (home)
| Action | Fields | What it does |
|---|---|---|
| `?/create` | `name`, `unitSystem` (`imperial` or `metric`) | Creates a project and redirects to it |

### `/p/<id>` (project page)
| Action | Fields | What it does |
|---|---|---|
| `?/update` | `name`, `unitSystem` | Renames the project or changes its units |
| `?/delete` | none | Owner only (a guest gets 403). Deletes the project, its rooms, photos (files too) and measurements; redirects to `/` |
| `?/share` | `email` | Owner only. Adds a guest who already has an account; says so if there is none, if it is you, or if they are already on it |
| `?/unshare` | `userId` | Owner only. Removes a guest |
| `?/handOver` | `userId` | Owner only. Makes a guest the owner; you stay on it as a guest |
| `?/leave` | none | A guest leaves the project; redirects to `/`. The owner cannot leave |
| `?/createRoom` | `name` | Adds a room |
| `?/renameRoom` | `roomId`, `name` | Renames a room |
| `?/deleteRoom` | `roomId` | Deletes a room; its photos move to "No room" |
| `?/setRoomArea` | `roomId`, `areaA`, `areaB` (measurement ids) | Chooses the two measurements a room's area is calculated from (length × width) |
| `?/deletePhoto` | `photoId` | Deletes a photo, its file and its measurements |

### `/p/<id>/photo/<photoId>` (photo page)
| Action | Fields | What it does |
|---|---|---|
| `?/create` | line end points (`x1` `y1` `x2` `y2`, fractions 0 to 1), `value`, optional `name` | Adds a measurement. The value is read in the project's units (`12' 6"`, `3.2m`, ...) |
| `?/update` | `id`, `value`, `name` | Edits a measurement |
| `?/move` | `id`, `x1` `y1` `x2` `y2` | Saves new end points after a drag |
| `?/delete` | `id` | Deletes a measurement |
| `?/setRoom` | `roomId` (empty for "No room") | Moves the photo, and its measurements, to another room (clears any room area built from them) |
| `?/deletePhoto` | none | Deletes this photo; redirects to the project page |

The field names above are the ones the app sends; the source of truth is each route's `+page.server.ts`.
