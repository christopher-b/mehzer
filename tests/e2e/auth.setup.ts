import { expect, test as setup } from '@playwright/test';
import { ADMIN, PASSWORD, authFile } from './constants';

setup('create the first account (or sign in) and save the session for the other projects', async ({ page }, testInfo) => {
	await page.goto('/login');
	if (page.url().endsWith('/setup')) {
		// A fresh database: the setup password creates the administrator.
		await page.getByLabel('Setup password').fill(PASSWORD);
		await page.getByLabel('Your name').fill(ADMIN.name);
		await page.getByLabel('Email').fill(ADMIN.email);
		await page.getByLabel('New password', { exact: true }).fill(ADMIN.password);
		await page.getByLabel('Repeat the password').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Create account' }).click();
	} else {
		await page.getByLabel('Email').fill(ADMIN.email);
		await page.getByLabel('Password').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	}
	await expect(page).toHaveURL('/');
	await page.context().storageState({ path: authFile(testInfo.project.name as 'setup' | 'setup-safari') });
});
