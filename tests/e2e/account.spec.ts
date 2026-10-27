import { expect, test } from './fixtures';
import { PORT } from './constants';
import { failAction, inviteAndJoin, uniqueName, visit } from './helpers';

const PASSWORD = 'a long enough password';

test('changing your email address: the new one signs you in, the old one does not', async ({ page, browser }) => {
	const ben = await inviteAndJoin(page, browser, uniqueName('Ben'));
	try {
		await visit(ben.page, '/account');
		const section = ben.page.locator('section', { has: ben.page.getByRole('heading', { name: 'Email address' }) });
		const newEmail = ben.email.replace('@', '-new@');

		// a wrong password and an address that already has an account are explained
		await section.getByLabel('New email address').fill(newEmail);
		await section.getByLabel('Current password').fill('not my password');
		await section.getByRole('button', { name: 'Change email address' }).click();
		await expect(section.getByText('Your current password is not right.')).toBeVisible();
		await section.getByLabel('New email address').fill('e2e-admin@example.com');
		await section.getByLabel('Current password').fill(PASSWORD);
		await section.getByRole('button', { name: 'Change email address' }).click();
		await expect(section.getByText('That email address already has an account.')).toBeVisible();

		await section.getByLabel('New email address').fill(newEmail);
		await section.getByLabel('Current password').fill(PASSWORD);
		await section.getByRole('button', { name: 'Change email address' }).click();
		await expect(section.getByText(`Your email address is now ${newEmail}.`)).toBeVisible();
		await expect(ben.page.getByText(newEmail, { exact: true }).first()).toBeVisible();

		// still signed in here; signing in with the old address fails, the new one works
		for (const [email, ok] of [
			[ben.email, false],
			[newEmail, true]
		] as const) {
			const other = await browser.newContext({ baseURL: `http://localhost:${PORT}`, storageState: { cookies: [], origins: [] } });
			const login = await other.newPage();
			await login.goto('/login');
			await login.getByLabel('Email').fill(email);
			await login.getByLabel('Password').fill(PASSWORD);
			await login.getByRole('button', { name: 'Sign in', exact: true }).click();
			if (ok) await expect(login).toHaveURL('/');
			else await expect(login.getByText('Incorrect email or password')).toBeVisible();
			await other.close();
		}
	} finally {
		await ben.context.close();
	}
});

test('a form on the account page that cannot reach the server shows a message, not the error page', async ({ page }) => {
	await visit(page, '/account');
	await failAction(page, 'signOutOthers', 'offline');
	await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
});
