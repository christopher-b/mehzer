import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { inviteAndJoin, uniqueName, visit } from './helpers';

// Chromium can pretend to be a phone's or laptop's built-in authenticator (fingerprint, face, PIN).
test.skip(({ browserName }) => browserName !== 'chromium', 'virtual authenticators are a Chromium feature');

async function addAuthenticator(context: BrowserContext, page: Page) {
	const cdp = await context.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return cdp;
}

test('add a passkey, sign in with it, rename it, remove it', async ({ page, browser }) => {
	const ben = await inviteAndJoin(page, browser, uniqueName('Pia'));
	try {
		await addAuthenticator(ben.context, ben.page);
		await visit(ben.page, '/account');
		const section = ben.page.getByRole('region', { name: 'Passkeys' });
		await expect(section.getByText('You have no passkeys yet.')).toBeVisible();

		await section.getByLabel('Name for the new passkey').fill('Laptop');
		await section.getByRole('button', { name: 'Add a passkey' }).click();
		await expect(section.getByText('Passkey added.')).toBeVisible();
		await expect(section.getByLabel('Name of passkey Laptop')).toBeVisible();
		await expect(section.getByText('never used')).toBeVisible();

		// signed out: the passkey alone signs in, with no email or password
		await ben.context.clearCookies();
		await visit(ben.page, '/login?next=/account');
		await ben.page.getByRole('button', { name: 'Sign in with a passkey' }).click();
		await expect(ben.page).toHaveURL('/account');
		await expect(ben.page.getByText(ben.email, { exact: true })).toBeVisible();
		await expect(section.getByText('last used')).toBeVisible();

		// rename, then remove: the passkey no longer signs in, the password still does
		await section.getByLabel('Name of passkey Laptop').fill('Work laptop');
		await section.getByRole('button', { name: 'Rename' }).click();
		await expect(section.getByText('Saved.')).toBeVisible();
		await section.getByRole('button', { name: 'Remove passkey Work laptop' }).click();
		await expect(section.getByText('Passkey removed.')).toBeVisible();
		await expect(section.getByText('You have no passkeys yet.')).toBeVisible();

		await ben.context.clearCookies();
		await visit(ben.page, '/login');
		await ben.page.getByRole('button', { name: 'Sign in with a passkey' }).click();
		await expect(ben.page.getByText('That passkey could not be used to sign in.')).toBeVisible();
		await expect(ben.page).toHaveURL(/\/login/);
		await ben.page.getByLabel('Email').fill(ben.email);
		await ben.page.getByLabel('Password').fill('a long enough password');
		await ben.page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(ben.page).toHaveURL('/');
	} finally {
		await ben.context.close();
	}
});
