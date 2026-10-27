# Agent notes for Mehzur

Mehzur is a SvelteKit 3 / Svelte 5 app (SQLite, Docker) for measuring rooms from photos. Read [docs/contributing.md](docs/contributing.md) first: it has the environment, the checks to run and the known pitfalls. This file is the short version plus what is easy to get wrong.

## Where things are

- [README.md](README.md): what the app does. [docs/architecture.md](docs/architecture.md): code layout. [docs/decisions.md](docs/decisions.md): settled decisions. [docs/testing.md](docs/testing.md): test commands. [PLAN.md](PLAN.md): what is left to do.
- [docs/code-review.md](docs/code-review.md): a prioritised list of hand-off tasks (A1 to E5), each with files, problem, change and a "Done when" test. Some are done or changed by later work (the doc says so where it matters); check the code before starting one.
- Do not report or "fix" anything listed in `docs/decisions.md` (browser `confirm()`, tap-target size, few transactions, `Db` typed with `any`, one canvas component, light theme only).

## Rules

- Use `mise exec -- npm ...` if `node` is not on the path. npm only.
- Imports use `#lib/...` with the `.ts` extension. There is no `$lib`.
- Never touch `./data` (the developer's own database).
- Before finishing a change: `npm run check`, `npm test`, `npm run check:e2e`, and for UI changes `npm run test:e2e` (and `npm run test:e2e:safari` for style or focus changes). Stop anything on port 4180 first (`lsof -ti :4180 | xargs kill`). A leftover server makes the next run time out waiting for the web server.
- Accessible names (button, field, dialog titles) are a contract with `tests/e2e`. Change them only together with `tests/e2e/helpers.ts` and the specs, in the same commit.
- Do not commit unless asked. Update `PLAN.md`, `docs/` and `docs/phone-test-checklist.md` when behaviour or file names change.
- Match the surrounding comment density; comment only what the code does not show.

## UI building blocks (reuse these)

- `src/lib/components/ui/Dialog.svelte`: a native modal `<dialog>` with a title and any content. `Modal.svelte` is a Dialog holding one form. `PopupMenu.svelte` is for menus and small popovers; `AddTile.svelte` is the dashed "+" tile.
- Forms shared between create and edit: `ProjectForm.svelte` (create in `routes/AddProject.svelte`, edit in `ProjectEditDialog.svelte`) and `routes/p/[id]/RoomNameForm.svelte` (add in `AddRoom.svelte`, rename in `RoomRenameDialog.svelte`). `MeasurementDialog.svelte` already does create and edit with a `mode` prop. Add a mode or prop before writing a near copy.
- `ProjectMenu.svelte` takes the project as a prop and owns its edit and share dialogs, so it works in the project header and on each project in the list.
- Forms use `use:enhance={submitWith({...})}` from `#lib/client/enhance.ts`; `postAction` (`#lib/client/actions.ts`) is the other way to submit and is used by the measurement and change-room dialogs.

## Things that bit us

- **Errors in a dialog must be inline.** A modal makes the page behind it inert, so error toasts cannot be seen or dismissed. Pass `onError` and `onFailure` to `submitWith` and show the message in the dialog.
- **Posting to another page's action** (for example the project list posting to `/p/{id}?/update`): SvelteKit 3 follows a successful action to that page. Pass `navigate: false` to `submitWith`.
- **Opening a dialog from a menu:** call the menu's `close(true)` first so focus returns to the menu button when the dialog closes. Dialogs must not be rendered inside a `PopupMenu` panel (it is `hidden` when closed); render them beside it.
- **Safari does not focus a button on click**, so a dialog has nowhere to return focus to. `AddTile` focuses itself on click for this reason.
- Dialog `open` is reset the moment it closes by any means (see `Dialog.svelte`); keep it as the single source of truth rather than tracking a second flag.
- macOS `sed -i` needs a suffix argument (`sed -i ''`). Prefer the edit tool.
- The browser tests build the app first, so a full run takes several minutes; run a single spec with `npx playwright test tests/e2e/<file> -g "<title>"` while iterating.
