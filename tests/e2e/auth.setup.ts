import { expect, test as setup } from '@playwright/test';
import { PASSWORD, authFile } from './constants';

setup('sign in once and save the session for the other projects', async ({ page }, testInfo) => {
	await page.goto('/login');
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/');
	await page.context().storageState({ path: authFile(testInfo.project.name as 'setup' | 'setup-safari') });
});
