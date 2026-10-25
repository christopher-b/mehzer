import { defineConfig, devices } from '@playwright/test';
import { PASSWORD, PORT, SECRET, authFile } from './tests/e2e/constants';

const baseURL = `http://localhost:${PORT}`;
const touch = { hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
// Use an installed Chrome/Edge instead of Playwright's Chromium (Chromium projects only).
const chromium = { channel: process.env.E2E_CHANNEL || undefined };

// End-to-end tests run against the production build (`vite preview`) with a throwaway database and
// photo folder in `.e2e-data`. See README ("End-to-end tests").
//
//  - `npm run test:e2e`         Chromium: desktop and phone-sized (the default)
//  - `npm run test:e2e:safari`  WebKit, Safari's engine: desktop Safari and an iPhone (needs
//                               `npx playwright install webkit`)
//  - `npm run test:e2e:all`     everything
// Set E2E_CHANNEL=msedge or chrome to use an installed browser for the Chromium projects, and
// E2E_SKIP_BUILD=1 to reuse the last build while iterating.
export default defineConfig({
	testDir: 'tests/e2e',
	outputDir: 'test-results',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL,
		colorScheme: 'light',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		// Each browser signs in once and saves its own session for the projects that depend on it.
		{ name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...chromium } },
		{ name: 'setup-safari', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Safari'] } },
		// Sign-in behaviour itself: starts signed out.
		{ name: 'auth', testMatch: /auth\.spec\.ts/, use: { ...chromium, viewport: { width: 1100, height: 1000 } } },
		// Everything else runs signed in, on a desktop and on a phone-sized touch screen.
		{
			name: 'desktop',
			testIgnore: [/auth\./],
			dependencies: ['setup'],
			use: { ...chromium, viewport: { width: 1100, height: 1000 }, storageState: authFile('setup') }
		},
		{
			name: 'phone',
			testIgnore: [/auth\./],
			dependencies: ['setup'],
			use: { ...chromium, viewport: { width: 360, height: 800 }, ...touch, storageState: authFile('setup') }
		},
		// The same specs in WebKit (Safari's engine): desktop Safari and an iPhone.
		{
			name: 'safari',
			testIgnore: [/auth\./],
			dependencies: ['setup-safari'],
			use: { ...devices['Desktop Safari'], viewport: { width: 1100, height: 1000 }, storageState: authFile('setup-safari') }
		},
		{
			name: 'iphone',
			testIgnore: [/auth\./],
			dependencies: ['setup-safari'],
			use: { ...devices['iPhone 15'], storageState: authFile('setup-safari') }
		}
	],
	webServer: {
		command: 'node tests/e2e/start-server.mjs',
		url: `${baseURL}/login`,
		reuseExistingServer: false,
		timeout: 240_000,
		stdout: 'pipe',
		env: {
			E2E_PORT: String(PORT),
			E2E_PASSWORD: PASSWORD,
			E2E_SECRET: SECRET,
			E2E_SKIP_BUILD: process.env.E2E_SKIP_BUILD ?? ''
		}
	}
});
