# Code quality review (26 Oct 2026)

A review of the whole codebase for correctness, error prevention, readability, concision, accessibility, modularity and best practice. Every finding below was checked by reading the code. Findings marked **(unconfirmed)** depend on runtime behaviour that was not reproduced.

**State at review time:** `npm run check` reports 0 errors and 0 warnings; `npm test` passes 417 tests in 33 files; `npm audit --omit=dev` finds 0 vulnerabilities. The code is in good shape overall: Svelte 5 runes are used everywhere (no Svelte 4 syntax, no `{@html}`), errors are classified in one table, tokens are stored hashed, projects are scoped through `getProjectOr404`, CSV formula injection is blocked, and the e2e tests find elements by role and never sleep.

Things recorded as deliberate in `docs/decisions.md` are **not** reported here as problems: browser `confirm()` for deletes, no bigger tap targets in general, light theme only, `Db` typed with `any`, repeated project lookups per action, few transactions where the write order is harmless, and `AnnotationCanvas` kept as one component. Task B3 is the one exception: it asks for a transaction, because there the write order is *not* harmless.

---

## How to use this document (for the implementer)

- Do the tasks **in order of priority** (P0 first). Each task stands on its own and should be **one commit**. Commit messages follow the existing style: an imperative sentence describing the user-visible effect.
- Read `docs/contributing.md` first. In particular:
  - Imports use `#lib/...` **with the `.ts` extension**. `$lib` and `$env` do not exist; server env comes from `$app/env/private`.
  - **Accessible names are a contract with the browser tests.** If you rename a button, label or dialog, update `tests/e2e/helpers.ts` and the specs in the same commit.
  - Never touch `./data`.
- Before finishing **each** task, run:
  ```sh
  npm run check        # must stay at 0 errors and 0 warnings
  npm test
  npm run check:e2e
  npm run test:e2e     # for any UI change (stop anything on port 4180 first)
  ```
- Add or extend tests as each task's "Done when" says. Unit tests sit next to the code (`*.test.ts`); route tests are in `src/tests/`; browser tests are in `tests/e2e/`.
- Do not widen a task's scope. If something looks wrong but is not listed, note it rather than fixing it.

Priority key:
- **P0:** security problems, or wrong data saved without any warning.
- **P1:** bugs a user can hit.
- **P2:** accessibility.
- **P3:** modularity, readability and concision.
- **P4:** tooling, tests and docs.

---

## P0: security and silent data errors

### A1. Close the open redirect in `safeNext` (done)
- **Files:** `src/lib/safeNext.ts`. New test file `src/lib/safeNext.test.ts`.
- **Problem:** `value.startsWith('/') && !value.startsWith('//')` accepts `/\evil.com`, `/\t/evil.com` and `/\n/evil.com`. Browsers treat `\` as `/` and strip tab and newline characters, so all three go to `https://evil.com/` (checked with `new URL('/\\evil.com', 'https://app.x')`). The helper is used by `login/+page.server.ts` (server redirect) and `login/+page.svelte` (passkey sign-in), so `/login?next=%2F%5Cevil.com` sends people to another site right after a real sign-in.
- **Change:**
  ```ts
  export function safeNext(value: string | null): string {
  	if (!value || !value.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(value)) return '/';
  	try {
  		const url = new URL(value, 'http://x.invalid');
  		return url.origin === 'http://x.invalid' ? url.pathname + url.search + url.hash : '/';
  	} catch {
  		return '/';
  	}
  }
  ```
- **Done when:** unit tests cover each of these, all of which must return `/`: `null`, `''`, `'//evil.com'`, `'/\\evil.com'`, `'/\\/evil.com'`, `'/\t/evil.com'`, `'/\n/evil.com'`, `'https://evil.com'`, `'javascript:alert(1)'`, `'p/1'`. They also check that `'/p/abc?x=1#y'` comes back unchanged.

### A2. Stop metric inputs with a comma being read as feet and inches (done)
- **Files:** `src/lib/units.ts` (the comma separator around line 37 and the metric fallback around lines 91–98), `src/lib/units.test.ts`.
- **Problem:** In a metric project, `3,5` is saved as 1041.4 mm (3′ 5″) instead of 3.5 m. Likewise `0,5` becomes 127 mm and `5 6` becomes 1676.4 mm. This happens because anything that is not a plain metric number falls back to `parseImperial`. Comma decimals are normal in most metric countries, and the server accepts these values.
- **Change:**
  1. In metric mode, before matching, turn a decimal comma into a point: `s.replace(/^(\d+),(\d+)(?=\s*(mm|cm|m)?$)/, '$1.$2')`.
  2. In metric mode, only fall back to `parseImperial` when the text contains an explicit imperial marker: `'`, `"`, `′`, `″`, `ft`, `feet`, `foot`, `in`, `inch` or a fraction. Otherwise return `null`.
- **Done when:** these new metric tests pass: `3,5` → 3500, `0,5` → 500, `3,25m` → 3250, `5 6` → `null`, and `5' 6"` → 1676.4 (still accepted). All existing tests still pass.

### A3. Stop `1,000` being read as 1′ 0″ in imperial (done; also fixed `5ft6in`, which the `\b` unit match rejected)
- **Files:** `src/lib/units.ts` (feet/inches separator `[-,]?`), `src/lib/units.test.ts`.
- **Problem:** `parseLength('1,000', 'imperial')` returns 304.8 mm, because the comma is taken as the separator between feet and inches.
- **Change:** Only accept `,` as a feet/inches separator when the part after it is at most two digits, optionally followed by an inch mark. Otherwise return `null`.
- **Done when:** `1,000` → `null`, and `12',6"` and `12, 6` behave as they do now (check the current tests first; keep whatever they assert).

### A4. Keyboard shortcuts on the photo page fire on focused buttons and links (done; Delete, Backspace and the arrows still work from a focused button, only Enter is skipped)
- **Files:** `src/routes/p/[id]/photo/[photoId]/PhotoView.svelte` (`onKeydown`, around line 168).
- **Problem:** While a measurement is selected, the window `keydown` handler ignores only `input, textarea, select`. Pressing Enter on a focused button or link therefore *also* opens the edit dialog. On a list "Delete" button, keydown opens the dialog and the click that follows deletes the measurement. Enter on the "Back" link both navigates and opens the dialog.
- **Change:** Ignore the event when `target.closest('input, textarea, select, button, a, [contenteditable], [role="menuitem"], dialog')` matches. Do the same in the ArrowLeft/ArrowRight branch above it, which uses the same check.
- **Done when:** a new e2e test selects a measurement, focuses the list's Edit button with the keyboard and presses Enter. Exactly one dialog opens: the Edit dialog, opened once by the button's click and not twice. Existing keyboard tests still pass.

### A5. Prevent double submits on enhanced forms (done for the forms that use `submitWith` in dialogs and popovers; the account and admin forms are still B9)
- **Files:** `src/lib/client/enhance.ts` (`submitWith`).
- **Problem:** `submitWith` has no in-flight guard, and no submit button is disabled while a request is pending. A double tap on "Create" (project), "Add room" or "Create invite link" creates two rows. Only `postAction` paths with a `busy` flag are protected today.
- **Change:**
  1. Inside `submitWith`, keep a `WeakSet<HTMLFormElement>` of pending forms. The SubmitFunction receives `formElement`. If the form is already in the set, `cancel()` and return. Add it before the request, and remove it in a `finally` around the returned callback. Also remove it when `confirm` cancels.
  2. Add an optional `pending?: (pending: boolean) => void` option, called with true and then false, so components can set `disabled={busy}` and `aria-busy={busy}` on their submit button.
  3. Use `pending` in `AddProject.svelte`, `AddRoom.svelte`, `ProjectEditDialog.svelte`, `ProjectShareDialog.svelte`, `RoomNameForm.svelte` and `RoomAreaForm.svelte`.
- **Done when:**
  - A unit test for `submitWith` shows that a second call while the first is pending calls `cancel`.
  - An e2e test double-clicks "Create" in the add-project popover and finds exactly one new project.
  - Admin and account forms get the guard in B9 once they move to `submitWith`.

---

## P1: bugs a user can hit

### B1. Upload queue keeps running after leaving the project page (done)
- **Files:** `src/lib/client/uploads.svelte.ts`, `src/lib/client/upload.ts`, `src/routes/p/[id]/+page.svelte`.
- **Problems:**
  1. Nothing stops the queue when the page is left. When the batch finishes, `onsettled` calls `goto('/p/<id>/photo/<first>')` and pulls the user back from wherever they went.
  2. The project id is read lazily for each file (`this.#projectId()`). If the component is reused for another project, queued files could upload there **(unconfirmed)**.
  3. `#running` is reset before `await this.#onsettled(...)`. Files added during that await start a second run, and the first run's `goto` can fire in the middle of it.
  4. `void this.#run()` swallows rejections from `onsettled` or `goto`.
- **Change:**
  1. Capture the project id once per `add()` call and store it on each queued item.
  2. Keep each item's `XMLHttpRequest` (return it from `sendPhoto`, or accept an `AbortSignal`). Add `destroy()`, which aborts in-flight uploads and sets a `#destroyed` flag. While that flag is set, `#onsettled` is not called.
  3. Call `uploads.destroy()` from `onDestroy` in the project page.
  4. Use `beforeNavigate(({ cancel }) => { if (uploads.busy && !confirm('Photos are still uploading. Leave anyway?')) cancel(); })`.
  5. Keep `#running` true until `onsettled` has finished, then check `#next()` again.
  6. Replace `void this.#run()` with `this.#run().catch((e) => console.error(e))`.
  7. Delete the entry from `#files` once an item is `uploaded`.
- **Done when:**
  - A new `uploads.svelte.test.ts` (mock `./upload.ts` with `vi.mock` and deferred promises) shows that `destroy()` mid-batch prevents `onsettled`, and that files added during `onsettled` are uploaded.
  - An e2e test starts a slow upload (`page.route` delay), clicks the "Mehzur" home link, accepts the prompt, and stays on `/`.

### B2. Overlapping drags of one line race each other (done)
- **Files:** `src/routes/p/[id]/photo/[photoId]/PhotoView.svelte` (the move handler around lines 129–144), `src/lib/client/actions.ts`.
- **Problems:**
  - When a line is dragged twice quickly, the first request's `finally { delete movedLines[id] }` removes the second drag's override, so the line snaps back.
  - The "Retry" in the failure notification calls `postAction('move', ...)`, which posts to `?/move` on *whatever page is current* when it is clicked. That may be another photo.
- **Change:**
  1. Keep `const moveSeq: Record<string, number> = {}`. In the handler, `const seq = (moveSeq[id] = (moveSeq[id] ?? 0) + 1)`, and in `finally` only delete `movedLines[id]` when `moveSeq[id] === seq`.
  2. Give `postAction` an optional explicit path (for example `postAction('move', fields, { path: '/p/<id>/photo/<photoId>' })`, posting to `${path}?/move`). Use it for the move and its retry.
- **Done when:** the move e2e tests still pass. A new e2e test delays the first `?/move` response (`page.route`), drags twice, and checks the line ends at the second position.

### B3. Accepting an invite can leave it used up, or fail with a 500 (done)
- **Files:** `src/lib/server/invites.ts` (`acceptInvite`), `src/lib/server/users.ts` (`createUser`).
- **Problem:** `acceptInvite` marks the invite used, calls `createUser`, then undoes the mark if that returned an error. `createUser` checks `findUserByEmail`, then `await hashPassword(...)` (which yields), then inserts. Two requests for the same email can both pass the check. The second insert then throws a UNIQUE error, so the user gets a 500 and the invite stays marked used with no account. The same race affects `/setup` (two admins could be created) and `setEmail` in `emailChange.ts`.
- **Change:**
  1. In `createUser`, hash the password **before** checking the email. Then do the check and insert inside `db.transaction((tx) => { ... })` (synchronous: use `.get()`, `.run()` and `.all()` inside, as `handOver` in `sharing.ts` does). Catch a `SQLITE_CONSTRAINT_UNIQUE` error and return `{ error: EMAIL_TAKEN }`.
  2. In `acceptInvite`, hash first, then claim the invite, insert the user and set `usedBy` in one synchronous transaction. Remove the manual "undo" update.
  3. In `setup/+page.server.ts`, re-check `countUsers(...) === 0` inside the same transaction as the insert.
  4. In `emailChange.ts`, check `EMAIL_TAKEN` *before* claiming the token in `completeEmailChange`, and do the claim and update in one transaction.
- **Done when:** existing tests in `src/lib/server/accounts.test.ts` and `src/tests/accounts-routes.test.ts` pass. New tests show:
  - `createUser` returns `EMAIL_TAKEN` (not a throw) when a row with that email is inserted between the check and the insert. Simulate it by inserting directly and then calling `createUser`, or test the catch path.
  - A failed `acceptInvite` leaves the invite usable.

### B4. Add basic security headers (done)
- **Files:** `src/hooks.server.ts`, `vite.config.ts` (the `kit` options passed to `sveltekit({...})`), `src/routes/api/photos/[...key]/+server.ts`.
- **Problem:** There is no `X-Content-Type-Options`, `Referrer-Policy`, frame protection or CSP. Reset and invite links carry their token in the path (`/reset/<token>`), so a referrer must never leak it. Photos are served with the content type the browser claimed at upload.
- **Change:**
  1. In `handle`, after `resolve(event)`, set the following on the response (only where not already set):
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: same-origin`
     - `X-Frame-Options: DENY`
  2. Turn on SvelteKit's CSP: `csp: { mode: 'auto', directives: { 'default-src': ['self'], 'img-src': ['self', 'blob:', 'data:'], 'frame-ancestors': ['none'], 'object-src': ['none'], 'base-uri': ['self'] } }`. Check where the Kit 3 config accepts `csp` (it moved into the plugin options together with `adapter`). Run the full e2e suite, including `test:e2e:safari`, because a CSP can break inline styles or scripts. If it does, add `'unsafe-inline'` to `style-src` only.
  3. **Optional:** in the upload endpoint, check the first bytes match the claimed type (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`) and answer 415 otherwise.
- **Done when:** a route test (`src/tests/`) checks the three headers on a page response, and all e2e suites pass.

### B5. Error notifications are pushed out by success notifications (done)
- **Files:** `src/lib/client/notify.svelte.ts` (around line 22), `src/lib/client/notify.test.ts`.
- **Problem:** When more than `MAX_VISIBLE` notifications are shown, the oldest is removed, even if it is an error that is meant to stay until dismissed. That can remove a "Couldn't save the new position" notification together with its Retry button.
- **Change:** When over the limit, remove the oldest notification that is **not** an error. Only remove errors when every notification is an error.
- **Done when:** a new test shows one error followed by `MAX_VISIBLE` successes keeps the error. Update the existing eviction test if it asserts otherwise.

### B6. `postAction` turns a successful save into an error when the refresh fails (done)
- **Files:** `src/lib/client/actions.ts` (around lines 35 and 42).
- **Problem:** `await invalidateAll()` runs after the action has succeeded but is not caught. If it rejects, `PhotoView.saveMeasurement` shows a failure and leaves the dialog open, and pressing Save again creates a second measurement **(unconfirmed whether Kit 3 rejects here)**. `enhance.ts` already uses `.catch(() => {})` for the same call.
- **Change:** Use `await invalidateAll().catch(() => {})` in both places.
- **Done when:** a unit test (mock `$app/navigation`) shows `postAction` resolves with the action data even when `invalidateAll` rejects.

### B7. Uploads have no timeout (done)
- **Files:** `src/lib/client/upload.ts` (`sendPhoto`).
- **Problem:** There is no `xhr.timeout`. On a stalled mobile connection the request hangs forever, the queue stays busy, and no later file is sent.
- **Change:** Set `xhr.timeout = 120_000` and add `xhr.ontimeout = () => reject(classifyThrown(new TypeError('timeout')))`, matching the `onerror` path so it is retryable.
- **Done when:** a unit test with a fake XHR (assign `globalThis.XMLHttpRequest`) shows a timeout rejects with a retryable network error.

### B8. The client error hook reports every `TypeError` as a network error (done)
- **Files:** `src/hooks.client.ts`, `src/app.d.ts` (`App.Error`), `src/lib/client/enhance.ts` (around line 30), `src/routes/+error.svelte`, `src/lib/client/errors.ts`.
- **Problem:**
  - Any `TypeError` in client code (for example `x is undefined` in a universal load) is shown as "Network error" with status 503 and never logged.
  - The network case is then detected by comparing message strings (`err?.message === NETWORK_ERROR_MESSAGE`).
  - `hooks.client.ts` and `hooks.server.ts` each define their own `GENERIC_MESSAGE`.
- **Change:**
  1. Add `code?: 'network'` to `App.Error`.
  2. In `hooks.client.ts`, treat the error as a network error only when `!navigator.onLine` or `/fetch|network|load failed/i.test(error.message)`, and return `{ status: 503, message: NETWORK_ERROR_MESSAGE, code: 'network' }`. Log every other error with an id, as now.
  3. In `enhance.ts`, test `err?.code === 'network'` instead of comparing the message.
  4. Move `GENERIC_MESSAGE` into `errors.ts` (or reuse `MESSAGES.server`) and import it in both hooks and in `+error.svelte`. Keep the exported name in `hooks.server.ts` if tests import it.
- **Done when:** a new `src/hooks.client.test.ts` covers a fetch `TypeError` (network) and a plain `TypeError('x is undefined')` (logged, given an id). `src/tests/error-hook.test.ts` still passes.

### B9. Account and admin forms skip `submitWith` (done)
- **Files:** `src/routes/account/+page.svelte` (forms around lines 40, 55, 65, 91, 138), `src/routes/admin/users/+page.svelte` (around lines 16, 45, 74, 78, 82), `src/routes/account/email/[token]/+page.svelte` (around line 17).
- **Problem:** These use bare `use:enhance` or a custom callback. A network error or 500 replaces the whole page with the error page, and an expired session skips the "Signed out" prompt. On the account page the passkey Remove form uses `submitWith` but its sibling Rename form does not. **(Unconfirmed:)** plain `use:enhance` resets the Name form on success, which may empty the field.
- **Change:** Use `submitWith({ reset: true })` for password-type forms (they should clear) and `submitWith({ reset: false })` for the name, email and rename forms. Keep the existing `form?.x` result messages working: `submitWith` calls `update()` for success and `fail` results unless `onFailure` is given.
- **Done when:** e2e tests in `tests/e2e/account.spec.ts` and the admin tests pass. A new e2e test with `page.route('**/account?/signOutOthers', r => r.abort())` shows a notification and no error page.

### B10. The keyboard Delete path ignores `busy` (done)
- **Files:** `PhotoView.svelte` (`deleteAnnotation`, around line 96).
- **Problem:** `saveMeasurement` and `saveRoom` return early when `busy`, but `deleteAnnotation` does not. Pressing Delete twice quickly asks twice and sends two requests.
- **Change:** Start `deleteAnnotation` with `if (busy) return;`.
- **Done when:** checked by reading the code; no new test is required.

### B11. Renaming a measurement changes its stored value (done)
- **Files:** `PhotoView.svelte` (the dialog prefill, around line 61), `MeasurementDialog.svelte`, `src/routes/p/[id]/photo/[photoId]/+page.server.ts` (`update`), `src/lib/server/annotations.ts`.
- **Problem:** The edit dialog fills the value field with `formatLength(valueMm)`, which rounds to ⅛″ (or 1 mm). Saving only a new name sends that rounded text, which the server parses again. The stored length therefore drifts (for example 1000.05 mm becomes 1000.125 mm), and room areas change slightly.
- **Change:** When the value field still holds exactly the text it was prefilled with, leave out the `value` field (or send `valueUnchanged=1`). In `parseAnnotationFields`, return `valueMm: undefined` in that case, and have `update` not overwrite `valueMm` when it is `undefined`. Keep `''` meaning "clear the value".
- **Done when:** a route test in `src/tests/photo-actions.test.ts` creates a measurement with valueMm 1000.05, updates only its name, and checks valueMm is unchanged.

### B12. A successful sign-in clears the per-address failure counter (done)
- **Files:** `src/lib/server/users.ts` (`authenticate`), `src/routes/login/passkey/verify/+server.ts`.
- **Problem:** `clearFailures(db, keys)` clears the `ip:` key as well as the `email:` key. Anyone with one working account can sign in between guesses and reset the 50-per-address limit, which makes it useless.
- **Change:** On success, clear only the `email:` key: `clearFailures(db, keys.filter((k) => k.startsWith('email:')))`. In the passkey verify route, do not clear the `ip:` key on success.
- **Done when:** a test in `src/lib/server/accounts.test.ts` records failures for an IP, signs in successfully from it, and finds the IP failures still counted.

### B13. "Forgot password" timing shows whether an account exists (done)
- **Files:** `src/routes/forgot/+page.server.ts`.
- **Problem:** The answer is the same either way, but for a real account the handler waits for the SMTP send (often hundreds of ms). For an unknown address it returns at once. Response time therefore shows which addresses have accounts.
- **Change:** Do not await the send: `void sendEmail(...)`. `sendEmail` already catches and logs its own errors, so this cannot cause an unhandled rejection.
- **Done when:** existing forgot-password route tests pass. They may need `await vi.waitFor(...)` on the test mailer.

### B14. Limit wrong "current password" attempts on the account page (done)
- **Files:** `src/routes/account/+page.server.ts` (`passwordIsRight`).
- **Problem:** The email, password and delete-account actions check the current password without any limit. Someone with a stolen session cookie can guess the password and then take over the account.
- **Change:** Inside `passwordIsRight`, use the existing limiter with the key `current-password:<userId>`. If `isBlocked` is true, return a "blocked" result that the actions show as "Too many attempts. Wait a few minutes and try again." (status 429). Call `recordFailure` when the password is wrong and `clearFailures` when it is right.
- **Done when:** a route test makes 5 wrong attempts and gets 429 on the 6th.

---

## P2: accessibility

### C1. Announce form errors with one shared component (done)
- **Files:** new `src/lib/components/ui/FormError.svelte`. It replaces `{#if ...}<p class="error">...</p>{/if}` in:
  - `login`, `forgot`, `reset/[token]`, `setup`, `invite/[token]` and `account/email/[token]` `+page.svelte`
  - `account/+page.svelte` and `admin/users/+page.svelte`
  - `AddProject.svelte`, `AddRoom.svelte`, `RoomNameForm.svelte`, `RoomAreaForm.svelte` and `ProjectShareDialog.svelte`
  - `MeasurementDialog.svelte`, `ChangeRoomDialog.svelte` and the project `+page.svelte`
- **Problem:** Validation errors appear silently. Only the login passkey error has `role="alert"`.
- **Change:** `FormError` takes `message: string | null | undefined` and `id?: string`, and renders `<p class="error" role="alert" {id}>{message}</p>` only when there is a message. Where a single field is at fault, set `aria-invalid="true"` and `aria-describedby={id}` on it.
- **Done when:** an e2e test (in `accessibility.spec.ts`) submits a wrong login and finds `getByRole('alert')` with the message. Keep the CSS class `error` so existing selectors keep working.

### C2. Keep status regions mounted (done)
- **Files:**
  - `src/routes/+layout.svelte` (offline banner, around line 76)
  - `account/+page.svelte` (`role="status"` paragraphs)
  - `admin/users/+page.svelte` (around lines 28 and 59)
  - `account/email/[token]/+page.svelte` (around line 13)
- **Problem:** Each `role="status"` element is created together with its text. VoiceOver often does not announce a live region that appears already filled. `Notifications.svelte` already does this correctly.
- **Change:** Render the `role="status"` element always and put the `{#if}` *inside* it. Hide it when empty with `:empty { display: none }`, or use `.visually-hidden` for the empty state.
- **Done when:** the existing e2e tests pass. Check the markup has the status element present before the message appears.

### C3. Put focus somewhere sensible after menu actions (done)
- **Files:**
  - `src/lib/components/ProjectMenu.svelte` (Edit project, Share)
  - `src/routes/p/[id]/RoomMenu.svelte` (Rename, Delete)
  - `src/routes/p/[id]/RoomRenameDialog.svelte` (a dialog now, so the input is focused by the browser)
  - `src/routes/p/[id]/AddRoom.svelte`
  - `ProjectEditDialog.svelte` and `ProjectShareDialog.svelte` (modal dialogs now: the browser focuses the first control itself, so only check that closing returns focus to the menu button)
- **Problem:** After choosing a menu item, the menu hides and focus falls to `<body>`. The opened edit form, share panel or rename field is not focused, so on a phone the keyboard does not open for renaming. When a rename is saved or cancelled, focus is lost again. Delete menus close in `before`, which runs before `confirm()`, so cancelling still closes the menu.
- **Change:**
  1. Add `src/lib/client/focus.ts` exporting a `focusOnMount` action: `(node: HTMLElement) => { node.focus(); }`. Use it only if a form is added that is not in a dialog.
  2. Check that after a rename dialog closes, focus is back on the room's menu button.
  4. In `AddRoom`, call `close(true)` after success so focus returns to the tile.
  5. In `RoomMenu` and `PhotoView` delete forms, move `close` from `before` to `onSuccess`.
- **Done when:** an e2e test opens Room menu → Rename and expects the name input `toBeFocused()`, then presses Escape and expects the room's menu button focused.

### C4. `PopupMenu` keyboard behaviour (done)
- **Files:** `src/lib/components/ui/PopupMenu.svelte`.
- **Problem:** Tabbing out leaves the popup open. Home and End do nothing in `role="menu"`.
- **Change:**
  - Add `onfocusout={(e) => { if (open && !root.contains(e.relatedTarget as Node | null)) close(); }}` on the root element.
  - In `onPanelKeydown`, handle `Home` and `End` (first and last item).
  - For `kind === 'menu'`, close on `Tab` without preventing default.
- **Done when:** an e2e test opens the project menu, presses Tab past the last item and expects the menu hidden. Check the add-project and add-room dialog popovers still work, because they also use `PopupMenu` with `kind="dialog"`. Clicking from an input to a button inside the panel must not close it.

### C5. Give repeated buttons unique names and expose the selected measurement (done)
- **Files:** `src/routes/p/[id]/photo/[photoId]/MeasurementList.svelte`, `src/routes/p/[id]/PhotoGrid.svelte`, and the e2e helpers and specs that use these names.
- **Problem:**
  - Every row's buttons are named "Edit" and "Delete", and every photo's remove button is "Delete photo".
  - The selected row is shown only by a CSS class.
  - "Edit" is not disabled while busy, though "Delete" is.
- **Change:**
  - `aria-pressed={a.id === selectedId}` on the row button.
  - `aria-label="Edit {measurementName(a)}"` and `aria-label="Delete {measurementName(a)}"`.
  - `disabled={busy}` on Edit.
  - In `PhotoGrid`: `aria-label="Delete photo {number}"`, using the same number as the image's alt text.
  - Update `tests/e2e/helpers.ts` and the specs in the same commit (search for `'Edit'`, `'Delete'` and `'Delete photo'`).
- **Done when:** all e2e suites pass with the new names.

### C6. Measurement dialog field naming (done)
- **Files:** `src/routes/p/[id]/photo/[photoId]/MeasurementDialog.svelte`.
- **Problem:**
  - The changing hint (`<small>`: "Optional…", "Not recognised", "= 12′ 6″") sits inside the `<label>`, so the input's accessible name changes as the user types.
  - The unit keys are named by their symbols (`'`, `"`).
- **Change:**
  - Move `<small>` out of the label, give it an id, and set `aria-describedby` on the input and `aria-live="polite"` on the small. Add `aria-invalid` when the text does not parse.
  - Add `aria-label` to the unit keys: `'` → "feet", `"` → "inches", others stay as they are. Add `aria-pressed` on the ABC/123 toggle.
- **Done when:** `getByLabel('Length')` (or whatever the tests use today) still finds the input and e2e tests pass.

### C7. Make line end points usable without dragging (done)
- **Files:** `src/lib/components/AnnotationCanvas.svelte`.
- **Problem:**
  - Line end points can only be moved by dragging a 22 px circle (`r={11 * k}`), below the 24 px WCAG 2.5.8 minimum.
  - The SVG has `role="application"` but cannot take focus, and the a11y warnings are silenced.
  - A drag can get stuck if the handle unmounts mid-drag, because there is no `lostpointercapture` handling.
- **Change (in this order, one commit each if large):**
  1. Add `onlostpointercapture` that ends the drag the same way `pointerup` does.
  2. Draw a transparent hit circle (r = `22 * k`, `fill="transparent"`, `pointer-events="all"`) under each visible handle, like the line's `.hit` stroke.
  3. Give each handle `tabindex="0"`, `role="button"` and `aria-label="Start of {label}"` / `"End of {label}"`. Arrow keys move the point by 0.5% of the photo (Shift: 2%), then call `onmove` once, 400 ms after the last key press (store a timer; clear it on unmount).
  4. Remove `role="application"` from the SVG.
- **Done when:** an e2e test selects a measurement, focuses "End of …", presses ArrowRight five times, waits for the save, reloads, and finds the line's end x increased. Existing drag tests pass. This was not listed in `docs/decisions.md`; add a line there describing the keyboard support.

### C8. Smaller accessibility fixes (can be one commit) (done)
- `account/+page.svelte` and `admin/users/+page.svelte`: the page title is an `<h2>` and there is no `<h1>`. Make it `<h1>` and move the card headings up one level. Update e2e `getByRole('heading', { level })` uses, if any.
- `PhotoView.svelte`: add `aria-live="polite"` to the hint text (`.hint span`).
- `PhotoView.svelte` line 35: only use `?select=` if `data.annotations.some((a) => a.id === id)`.
- `src/app.css`:
  - Add `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`.
  - Replace `.visually-hidden` with the standard pattern (`position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path: inset(50%); white-space:nowrap; border:0`).
  - Add `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { transition: none !important; animation: none !important; } }`.
- `notify.svelte.ts` / `Notifications.svelte`: pause a notification's auto-dismiss timer on `pointerenter` and `focusin`, and resume it on `pointerleave` and `focusout`.

---

## P3: modularity, readability and concision

### D1. Extract the "+ tile with a popover form" component
- **Files:** `src/routes/AddProject.svelte` is now a dialog around `ProjectForm.svelte`, and `AddRoom.svelte` is a dialog around `RoomNameForm.svelte` too, so nothing is a popover form any more; this task is no longer needed. (Original idea: a new `src/lib/components/ui/AddPopover.svelte`.)
- **Change:**
  - Props: `label` (the tile text), `action`, `failureFallback`, `onSuccess?`, `onSession?`, and a `fields` snippet for the inputs. The component owns the `PopupMenu kind="dialog"`, the `AddTile` trigger, error state (with `FormError`), the pending state from A5, the Create/Cancel row and the shared styles.
  - Keep accessible names unchanged.
  - AddRoom's draft saving (`onSession`) must keep working.
- **Done when:** both components are mostly the `fields` snippet, and e2e passes.

### D2. One helper for form error state
- **Files:** `RoomNameForm.svelte`, `RoomAreaForm.svelte`, `ProjectShareDialog.svelte` (and `AddPopover` from D1).
- **Problem:** Each repeats `let error = $state(''); submitWith({ before: () => (error = ''), onFailure: (r) => (error = failureMessage(r, ...)), onError: (m) => (error = m) })`.
- **Change:** Add `formErrors(fallback: string)` in `src/lib/client/enhance.ts`, returning `{ get error(), options: SubmitOptions }`, using a `$state` inside a `.svelte.ts` file. Rename the file to `enhance.svelte.ts` if needed, and update imports.

### D3. Replace the `onpending` effect with a bindable prop
- **Files:** `AnnotationCanvas.svelte` (`$effect(() => onpending?.(pointA !== null))`), `PhotoView.svelte` (`onpending={(p) => (pendingPoint = p)}`).
- **Change:** In `AnnotationCanvas`, `let { pending = $bindable(false), ... } = $props()`, set `pending` wherever `pointA` changes (or `$effect.pre` if many places), and in `PhotoView` use `bind:pending={pendingPoint}`. Remove `onpending`.

### D4. Server parsing and result mapping tidy-up
- **Files:** `src/lib/server/projects.ts` (`parseName`), `src/lib/server/users.ts` (`parsePersonName`, the same function), `src/routes/p/[id]/+page.server.ts`.
- **Change:**
  1. Delete `parsePersonName` and use `parseName` from a single place. Move `parseName` and `parseUnitSystem` into `src/lib/server/forms.ts`, next to `formString`.
  2. Replace the `if (result === ...) return fail(...)` chains in `setRoomArea` and `share` with a lookup table next to each result type. For example, in `rooms.ts`: `export const roomAreaMessages: Record<Exclude<SetRoomAreaResult, 'ok'>, [number, string]> = { 'need-two': [400, 'Pick two measurements'], ... }`. Then in the action: `if (result !== 'ok') { const [status, error] = roomAreaMessages[result]; return fail(status, { error }); }`. Do the same for `ShareResult` (`sharingMessages`) and `SetPhotoRoomResult`.
  3. Remove the unused `and` import in `src/routes/+page.server.ts`.
- **Done when:** the route tests pass with the same messages and statuses.

### D5. Per-project client state carries across project changes
- **Files:** `src/routes/p/[id]/+page.svelte`, `src/lib/client/collapsed.svelte.ts`.
- **Problem:** The collapsed-rooms state is loaded only on mount. If SvelteKit reuses the page for `/p/A` → `/p/B` (back/forward or a typed URL), A's collapsed state carries over, and toggles save A's state under B's key **(no in-app link does this today)**.
- **Change:** Wrap the project page's markup in `{#key data.project.id}`, as the photo page does, and move `collapsed.load()` into an `$effect` that reads `data.project.id`.

### D6. Small UI correctness and concision fixes (one commit)
- `MeasurementTable.svelte`: when the filtered room has been deleted, the select shows "All rooms" but the list still filters by the old id. Use `const filter = $derived(roomFilter === 'all' || roomFilter === 'none' || rooms.some((r) => r.id === roomFilter) ? roomFilter : 'all')` and filter on `filter`.
- `src/routes/p/[id]/+page.svelte`: replace the per-room `{@const ... .filter(...)}` with one `$derived` that groups `data.photos` and `data.annotations` into `Map`s by `roomId` (null key for "No room").
- `src/lib/components/ui/Modal.svelte`: default `onsubmit` to `(e) => e.preventDefault()`, so a Modal without a handler never does a GET submit. Then remove the explicit `preventDefault`-only handler in `SessionExpired.svelte`.
- `ProjectShareDialog.svelte` imports `type Guest` from `#lib/server/sharing.ts`. Move the `Guest` interface to `src/lib/types.ts` (or similar shared module) and import it from there in both.

### D7. CSS duplication
- `.menu-note` is defined in both `ProjectMenu.svelte` and `+layout.svelte`. Move it to `src/app.css` next to `.menu` and delete both copies.
- `SessionExpired.svelte` `a.primary` copies `button.primary`. Change the `app.css` rule to `button.primary, a.primary` and delete the local copy. Check `+error.svelte` `.links a` for the same.
- `src/app.css`: delete the unused `button.link` rule (confirm with `grep -rn 'class="link"' src`).
- `AnnotationCanvas.svelte`: replace the hard-coded `#1f6feb` with `var(--accent)` (check the token's value matches; if not, add a token).
- `src/app.html` and `+layout.svelte` both declare a favicon. Keep one (`/icon.svg` in `app.html`) and remove the other, plus `src/lib/assets/favicon.svg` if it is then unused.

### D8. Image resizing robustness
- **Files:** `src/lib/image.ts`, `src/lib/client/upload.ts` (`prepareImage`).
- **Change:**
  - Fill the canvas white before drawing, so transparent PNGs do not turn black.
  - Set `ctx.imageSmoothingQuality = 'high'`.
  - In a `finally`, set `canvas.width = canvas.height = 0` to free memory on iOS.
  - In `prepareImage`, only treat a `createImageBitmap` rejection as `RefusedError(UNREADABLE_IMAGE)`. A null context or null blob should throw a normal (retryable) error.

### D9. Client type strictness and small guards (one commit)
- `src/lib/client/actions.ts`: `failureMessage` should use the error only if `typeof data.error === 'string'`, so the user never sees `[object Object]`. In `PhotoView.svelte`, replace `result?.id as string` with a `typeof` check.
- `src/lib/client/uploads.svelte.ts`: replace `this.#files.get(item.id)!` with a check that marks the item failed when the file is missing.
- `src/lib/client/upload-state.ts`: the `retry` action should only apply to items whose status is `failed` or `not-uploaded`. Add a test.
- `src/lib/client/drafts.ts`: check that the parsed draft's `kind` is one of the known values before using it.
- `src/lib/client/enhance.ts`: an `error` result with status 404 should also `invalidateAll()`, as the `failure` 404 path does. Remove the unreachable `?? new ActionError('server')`.
- `src/lib/client/errors.test.ts` (around lines 65–66) asserts that a JSON parse error reads as "Couldn't reach the server". Revisit this after B8; a parse error is a server problem, not a connection problem.

### D10. Units parser edge cases (after A2 and A3)
- **Files:** `src/lib/units.ts`, `src/lib/units.test.ts`.
- **Change:**
  - Accept `5ft6in`, `12ft6in` and `5ft6` by replacing `\b` with `(?![a-z])` in the `ft`/`in` replacements.
  - Reject lengths that round to zero (`mm < 1`).
  - Only merge a fraction onto an integer token, and reject `12 1/2 6`, `0.5 1/2`, `1/2 1/2` and `1.5/2`.
  - In `formatLength`, round metric to 0.1 mm *before* choosing cm or m, so 999.96 shows `1 m`.
  - Return `'—'` for non-finite or negative input.
- **Done when:** each case above has a test.

---

## P4: tooling, tests and docs

### E1. Catch unused code in the type check
- Add `"noUnusedLocals": true` and `"noUnusedParameters": true` to `tsconfig.json`'s `compilerOptions`. Fix what `npm run check` then reports. At review time this was only the unused `and` in `src/routes/+page.server.ts`, which D4 also removes.

### E2. CI
- `.github/workflows/docker.yml`: add `- run: npm run check:e2e` after `npm test`. Running the Chromium browser suite in CI is a separate decision for the owner: it needs `npx playwright install --with-deps chromium` and takes about 2 minutes.
- **Owner decision, not for the implementer:** there is no linter or formatter, yet `src/lib/server/db/types.ts` carries an `eslint-disable` comment. Either add ESLint (with `eslint-plugin-svelte`) and Prettier, or remove the comment.

### E3. Missing tests
Add these where the tasks above have not already added them:
- `src/lib/client/enhance.test.ts` for `submitWith`: success, `fail` with and without `onFailure`, 401 → session prompt, network error, 404 → `invalidateAll`.
- `src/lib/client/upload.test.ts` for `sendPhoto` with a fake XHR: 201, 401, redirect to `/login`, 4xx with and without a JSON message, 5xx with an id, network error, timeout.
- An e2e test that uploads a JPEG with EXIF Orientation 6 (add a small fixture under `tests/e2e/fixtures/`) and checks the stored photo is portrait. `image.ts` says orientation is applied, but nothing tests it.

### E4. Docs
- `src/env.ts`: the `APP_PASSWORD` description says "Password for the single app user". Change it to "Setup password: used once at /setup to create the administrator".
- `docs/decisions.md`: mark D10 and D18 as superseded by D37 and D38, using strikethrough as for the Cloudflare entries.
- `docs/testing.md`: note that `test:e2e:safari` also needs Chromium installed, because `setup-safari` depends on the Chromium `setup` project (`playwright.config.ts`).
- When B1, B4, B14 and C7 are done, add short entries to `docs/decisions.md` (upload queue cancelled on leave, security headers and CSP, current-password limit, keyboard handles).

### E5. Already planned: leftover `await`s
`PLAN.md` already lists dropping the leftover `await`s on synchronous database calls and wrapping multi-step writes in transactions. B3 does the writes where this matters most. Leave the rest to that plan item. Do not mix it into the tasks above, because it touches nearly every server file.

---

## Summary table

| ID | Priority | Area | Effort |
|----|----------|------|--------|
| A1 | P0 | Open redirect after sign-in | S |
| A2 | P0 | Metric comma read as ft/in | S |
| A3 | P0 | `1,000` read as 1′ 0″ | S |
| A4 | P0 | Photo-page shortcuts on buttons | S |
| A5 | P0 | Double submit | M |
| B1 | P1 | Upload queue lifecycle | M |
| B2 | P1 | Drag race and retry target | S |
| B3 | P1 | Invite, setup and email races | M |
| B4 | P1 | Security headers and CSP | M |
| B5 | P1 | Errors pushed out of notifications | S |
| B6 | P1 | `postAction` refresh failure | S |
| B7 | P1 | Upload timeout | S |
| B8 | P1 | Client `TypeError` misreported | S |
| B9 | P1 | Account/admin forms skip `submitWith` | S |
| B10 | P1 | Delete key ignores busy | XS |
| B11 | P1 | Rename re-rounds value | M |
| B12 | P1 | Sign-in clears IP limit | XS |
| B13 | P1 | Forgot-password timing | XS |
| B14 | P1 | Current-password guessing | S |
| C1–C8 | P2 | Accessibility | S–M each |
| D1–D10 | P3 | Modularity and readability | S–M each |
| E1–E5 | P4 | Tooling, tests and docs | S each |
