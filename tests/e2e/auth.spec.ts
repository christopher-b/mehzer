import type { Browser, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ADMIN, PORT } from './constants';

// These start signed out (see the "auth" project in playwright.config.ts). The administrator account already
// exists: auth.setup.ts created it.

async function signInAs(page: Page, who: { email: string; password: string }, next = '/login') {
	await page.goto(next);
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('visiting a page while signed out redirects to the sign-in page and back afterwards', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login\?next=%2F$/);

	await signInAs(page, ADMIN, '/p/does-not-matter');
	await expect(page).toHaveURL(/\/p\/does-not-matter$/); // sent back to where you were going (a 404 page here)
});

test('a wrong password or an unknown email is rejected with one message and no session', async ({ page, context }) => {
	await signInAs(page, { email: ADMIN.email, password: 'not the password' });
	await expect(page.getByText('Incorrect email or password')).toBeVisible();
	await expect(page).toHaveURL(/\/login/);
	await signInAs(page, { email: 'nobody@example.com', password: ADMIN.password });
	await expect(page.getByText('Incorrect email or password')).toBeVisible();
	expect((await context.cookies()).some((c) => c.name === 'mehzur_session')).toBe(false);

	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('signing in keeps you signed in across reloads, and signing out ends the session', async ({ page }) => {
	await signInAs(page, ADMIN);
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Mehzur', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Account menu' }).click();
	await expect(page.getByRole('menu').getByText(ADMIN.email)).toBeVisible();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('the session cookie is HttpOnly and not marked Secure over plain http', async ({ page, context }) => {
	await signInAs(page, ADMIN);
	await expect(page).toHaveURL('/');
	const cookie = (await context.cookies()).find((c) => c.name === 'mehzur_session')!;
	expect(cookie.httpOnly).toBe(true);
	expect(cookie.sameSite).toBe('Lax');
	expect(cookie.secure).toBe(false);
});

test('an unsafe "next" address is ignored after signing in', async ({ page }) => {
	await signInAs(page, ADMIN, '/login?next=//evil.example');
	await expect(page).toHaveURL('/');
});

test('a "next" address with a backslash does not leave the site either', async ({ page }) => {
	await signInAs(page, ADMIN, '/login?next=%2F%5Cevil.example');
	await expect(page).toHaveURL('/');
});

test('the setup page is gone once an account exists', async ({ request }) => {
	expect((await request.get('/setup')).status()).toBe(404);
});

test('the invite, reset and forgot-password pages need no session; account and admin pages do', async ({ request }) => {
	for (const path of ['/forgot', '/invite/nope', '/reset/nope']) {
		expect((await request.get(path)).status(), path).toBe(200);
	}
	for (const path of ['/account', '/admin/users']) {
		const res = await request.get(path, { maxRedirects: 0 });
		expect(res.status(), path).toBe(303);
	}
});

/** A second browser context with no cookies: another person on another device. */
async function newPerson(browser: Browser) {
	const context = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
	return { context, page: await context.newPage() };
}

test.describe('inviting someone', () => {
	test('the administrator makes an invite link, the person joins with it, and the two cannot see each other\'s projects', async ({ page, browser }) => {
		await signInAs(page, ADMIN);
		await page.getByRole('button', { name: 'Account menu' }).click();
		await page.getByRole('menuitem', { name: 'Users' }).click();
		await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

		const invitedEmail = `ben-${Date.now()}@example.com`;
		await page.getByLabel(/^Email address/).fill(invitedEmail);
		await page.getByRole('button', { name: 'Create invite link' }).click();
		const link = await page.getByLabel('Invite link').inputValue();
		expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
		await expect(page.getByText(`Waiting to be used`)).toBeVisible();

		// the admin makes a project that the new person must never see
		await page.goto('/');
		await page.getByRole('button', { name: 'Project', exact: true }).click();
		await page.getByLabel('Project name').fill('Private house');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page).toHaveURL(/\/p\//);
		const adminProjectUrl = page.url();

		const ben = await newPerson(browser);
		try {
			await ben.page.goto(new URL(link).pathname);
			await expect(ben.page.getByRole('heading', { name: 'Join Mehzur' })).toBeVisible();
			await expect(ben.page.getByLabel('Email')).toHaveValue(invitedEmail); // fixed by the invite
			await ben.page.getByLabel('Your name').fill('Ben');
			await ben.page.getByLabel('Password', { exact: true }).fill('ben has a long password');
			await ben.page.getByLabel('Repeat the password').fill('ben has a long password');
			await ben.page.getByRole('button', { name: 'Create account' }).click();
			await expect(ben.page).toHaveURL('/');
			await ben.page.getByRole('button', { name: 'Account menu' }).click();
			await expect(ben.page.getByRole('menu').getByText('Ben', { exact: true })).toBeVisible();
			await ben.page.keyboard.press('Escape');
			await expect(ben.page.getByText('Private house')).toHaveCount(0);

			// not the admin's page, not the users page
			expect((await ben.context.request.get(new URL(adminProjectUrl).pathname)).status()).toBe(404);
			expect((await ben.context.request.get('/admin/users')).status()).toBe(404);
			await ben.page.getByRole('button', { name: 'Account menu' }).click();
			await expect(ben.page.getByRole('menuitem', { name: 'Users' })).toHaveCount(0);
			await ben.page.keyboard.press('Escape');

			// the link works once
			const again = await newPerson(browser);
			await again.page.goto(new URL(link).pathname);
			await expect(again.page.getByText('no longer valid')).toBeVisible();
			await again.context.close();

			// Ben can leave, and it deletes what he made
			await ben.page.getByRole('button', { name: 'Project', exact: true }).click();
			await ben.page.getByLabel('Project name').fill("Ben's house");
			await ben.page.getByRole('button', { name: 'Create' }).click();
			await expect(ben.page).toHaveURL(/\/p\//);
			await ben.page.goto('/account');
			await ben.page.getByLabel('Type your email address to confirm').fill(invitedEmail);
			await ben.page.getByLabel('Current password').last().fill('ben has a long password');
			await ben.page.getByRole('button', { name: /Delete my account/ }).click();
			await expect(ben.page).toHaveURL(/\/login$/);
			await signInAs(ben.page, { email: invitedEmail, password: 'ben has a long password' });
			await expect(ben.page.getByText('Incorrect email or password')).toBeVisible();
		} finally {
			await ben.context.close();
		}
	});
});

test('an account page lets you change your password, and the old one stops working', async ({ page, browser }) => {
	// a throwaway account (invited through the admin page), so the shared administrator password is never changed
	await signInAs(page, ADMIN);
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Create invite link' }).click();
	const link = await page.getByLabel('Invite link').inputValue();
	const email = `pw-${Date.now()}@example.com`;

	const person = await newPerson(browser);
	try {
		await person.page.goto(new URL(link).pathname);
		await person.page.getByLabel('Your name').fill('Pat');
		await person.page.getByLabel('Email').fill(email);
		await person.page.getByLabel('Password', { exact: true }).fill('first long password');
		await person.page.getByLabel('Repeat the password').fill('first long password');
		await person.page.getByRole('button', { name: 'Create account' }).click();
		await expect(person.page).toHaveURL('/');

		await person.page.goto('/account');
		await person.page
			.locator('section', { has: person.page.getByRole('heading', { name: 'Password' }) })
			.getByLabel('Current password')
			.fill('first long password');
		await person.page.getByLabel('New password', { exact: true }).fill('second long password');
		await person.page.getByLabel('Repeat the new password').fill('second long password');
		await person.page.getByRole('button', { name: 'Change password' }).click();
		await expect(person.page.getByText('Password changed')).toBeVisible();

		const fresh = await newPerson(browser);
		await signInAs(fresh.page, { email, password: 'first long password' });
		await expect(fresh.page.getByText('Incorrect email or password')).toBeVisible();
		await signInAs(fresh.page, { email, password: 'second long password' });
		await expect(fresh.page).toHaveURL('/');
		await fresh.context.close();
	} finally {
		await person.context.close();
	}
});

test('too many wrong passwords block further sign-in attempts for that address', async ({ page }) => {
	const email = `locked-${Date.now()}@example.com`;
	for (let i = 0; i < 5; i++) await signInAs(page, { email, password: `wrong password ${i}` });
	await signInAs(page, { email, password: 'one more wrong password' });
	await expect(page.getByText('Too many failed attempts')).toBeVisible();
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
