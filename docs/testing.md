# Testing

| Command | What it does |
|---|---|
| `npm test` | Unit and route tests (`test:watch`, `test:coverage` also available) |
| `npm run check` | Type check (`check:e2e` for the browser tests) |
| `npm run test:e2e` | Browser tests in Chromium |
| `npm run test:e2e:safari` | The same tests in WebKit (Safari's engine) |

## End-to-end tests (Playwright)

Playwright tests drive the real app in a browser: sign in, create projects and rooms, upload photos, draw and edit measurements, calculate areas, move and delete things, plus layout and readability checks. Every spec runs twice, on a desktop-sized window and on a phone-sized touch screen. The same specs can also run in **WebKit**, Safari's engine, as desktop Safari and as an iPhone.

```sh
npx playwright install chromium   # once: downloads the browser the tests use
npm run test:e2e                  # builds the app, starts it, runs everything (about 2 minutes)
npm run test:e2e:report           # open the HTML report of the last run
```

- **Safari:** `npx playwright install webkit` once, then `npm run test:e2e:safari`. `npm run test:e2e:all` runs Chromium and WebKit together. WebKit is opt-in so that nobody needs it installed to run the default suite. It is Safari's rendering and JavaScript engine, not iOS Safari itself: it does not show the iPhone's camera sheet, keyboard or system dialogs, and it cannot inject real touch drags, so the manual phone checklist (linked at the end of this section) is still needed for those.
- The tests run against the **production build** (`vite preview`), with a throwaway database and photo folder in `.e2e-data` and a fixed test password, so they never touch your real data. The folder is wiped at the start of every run, and the server is stopped when the run ends.
- To use a browser you already have instead of downloading Chromium: `E2E_CHANNEL=chrome npm run test:e2e` (or `msedge`).
- To skip the build and reuse the last one while you iterate: `E2E_SKIP_BUILD=1 npm run test:e2e`. Run a single file with `npx playwright test measurements`, or one project with `--project=phone`.
- A failing test keeps a screenshot and a trace in `test-results/` (`npx playwright show-trace <file>`).
- `npm run check:e2e` type-checks the tests.

Tests use accessible roles and labels (`getByRole`, `getByLabel`) rather than CSS classes where possible, so they also catch missing labels. The app puts a `data-hydrated` attribute on `<html>` once its scripts are running, and the helpers (`visit`, `reload`) wait for it, because a click that lands before then is lost. Shared helpers (creating projects, drawing measurements, a colour-contrast audit, ...) are in `tests/e2e/helpers.ts`. Photos are generated in the browser, so there are no image files to maintain.

The browser tests cannot show everything. Things only a real phone can show (the camera sheet, the number pad, touch dragging, other browsers) are covered by a manual list: [docs/phone-test-checklist.md](phone-test-checklist.md).
