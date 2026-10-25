import { expect, test } from '@playwright/test';
import { PASSWORD } from './constants';

// These start signed out (see the "auth" project in playwright.config.ts).

test('visiting a page while signed out redirects to the sign-in page and back afterwards', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login\?next=%2F$/);

	await page.goto('/p/does-not-matter');
	await expect(page).toHaveURL(/\/login\?next=%2Fp%2Fdoes-not-matter$/);

	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/p\/does-not-matter$/); // sent back to where you were going (a 404 page here)
});

test('a wrong password is rejected with a message and no session', async ({ page, context }) => {
	await page.goto('/login');
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText('Incorrect password')).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
	expect((await context.cookies()).some((c) => c.name === 'mehzer_session')).toBe(false);

	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('signing in keeps you signed in across reloads, and signing out ends the session', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Mehzer', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('the session cookie is HttpOnly and not marked Secure over plain http', async ({ page, context }) => {
	await page.goto('/login');
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/');
	const cookie = (await context.cookies()).find((c) => c.name === 'mehzer_session')!;
	expect(cookie.httpOnly).toBe(true);
	expect(cookie.sameSite).toBe('Lax');
	expect(cookie.secure).toBe(false);
});

test('an unsafe "next" address is ignored after signing in', async ({ page }) => {
	await page.goto('/login?next=//evil.example');
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/');
});

test('API and photo addresses answer 401 when signed out', async ({ request }) => {
	expect((await request.get('/api/health')).status()).toBe(401);
	expect((await request.get('/api/photos/projects/x/y.jpg')).status()).toBe(401);
});

test('the login page itself stays reachable and needs no session', async ({ request }) => {
	expect((await request.get('/login')).status()).toBe(200);
});

test('the install files are public and the pages link to them', async ({ page, request }) => {
	await page.goto('/login');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1f6feb');

	const res = await request.get('/manifest.webmanifest');
	expect(res.status()).toBe(200);
	const manifest = await res.json();
	expect(manifest.display).toBe('standalone');
	for (const icon of manifest.icons) {
		const r = await request.get(icon.src);
		expect(r.status(), icon.src).toBe(200);
		expect(r.headers()['content-type']).toContain('image/png');
	}
	expect((await request.get('/apple-touch-icon.png')).status()).toBe(200);
	expect((await request.get('/icon.svg')).status()).toBe(200);
});
