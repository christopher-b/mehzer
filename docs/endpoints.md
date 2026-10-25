# Server endpoints

Every address except `/login` needs a signed-in session (a signed cookie set by `/login`). Signed out, pages redirect to `/login?next=<page>`, `/api/*` answers `401`, and scripted form calls (from the app's own JavaScript) get a `401` the app turns into a "Signed out" prompt.

"Form actions" are `POST` requests to the page address with `?/<name>` and form fields, for example `POST /p/<id>?/createRoom`. The app calls them with JavaScript; they also work as plain form posts. A failed check answers `400` with an `error` message; a missing item answers `404`.

## Pages

| Address | What it does |
|---|---|
| `GET /` | Home: the projects (newest first) with photo count, room count and total calculated area |
| `GET /login` | Sign-in form. Public |
| `GET /p/<id>` | Project page: rooms, photos, measurements and areas |
| `GET /p/<id>/photo/<photoId>` | Photo page: draw and edit measurements; previous and next photo in the same room |
| any other address | A friendly "Page not found" page. Server faults show "Something went wrong" with an error id and are logged |

## Downloads and API

| Address | What it does |
|---|---|
| `GET /p/<id>/export.csv` | CSV of the project: one row per measurement (room, room area, photo, measurement, value, value in mm) |
| `GET /p/<id>/export.pdf` | PDF of the project: each room's photos with the measurement lines drawn on, and the measurements listed |
| `GET /api/photos/<key>` | The photo file (served with long-lived caching; keys are never reused) |
| `POST /api/projects/<id>/photos` | Upload one photo (multipart: `file` as JPEG, PNG or WebP up to 15 MB, `width`, `height`, optional `roomId`). Answers `201` with the new photo. Errors are JSON `{ message }` |
| `GET /api/health` | Checks the database and photo storage on the current platform; answers `{ target, db, storage }` |
| `POST /logout` | Ends the session and redirects to `/login` |
| `GET /manifest.webmanifest`, `/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png` | Home-screen install files. Public (no session needed) |
| `GET /robots.txt` | Crawler rules (allows everything; the pages are behind the sign-in anyway) |

## Form actions

### `/login`
| Action | Fields | What it does |
|---|---|---|
| default (`POST /login`) | `password`, optional `next` | Checks the password, sets the session cookie, redirects to `next` (only addresses inside the app are accepted) |

### `/` (home)
| Action | Fields | What it does |
|---|---|---|
| `?/create` | `name`, `unitSystem` (`imperial` or `metric`) | Creates a project and redirects to it |

### `/p/<id>` (project page)
| Action | Fields | What it does |
|---|---|---|
| `?/update` | `name`, `unitSystem` | Renames the project or changes its units |
| `?/delete` | none | Deletes the project, its rooms, photos (files too) and measurements; redirects to `/` |
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
