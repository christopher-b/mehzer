import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { PORT } from './constants';
import { addRoom, createProject, roomCard, uniqueName, visit } from './helpers';

/** The administrator (this test's own page) invites someone, who joins in a separate browser. */
async function inviteAndJoin(admin: Page, browser: Browser, name: string) {
	const email = `${name.toLowerCase().replace(/\W+/g, '-')}@example.com`;
	await visit(admin, '/admin/users');
	await admin.getByLabel(/^Email address/).fill(email);
	await admin.getByRole('button', { name: 'Create invite link' }).click();
	const link = await admin.getByLabel('Invite link').inputValue();

	const context = await browser.newContext({ baseURL: `http://localhost:${PORT}` });
	const page = await context.newPage();
	page.on('dialog', (dialog) => dialog.accept());
	await page.goto(new URL(link).pathname);
	await page.getByLabel('Your name').fill(name);
	await page.getByLabel('Password', { exact: true }).fill('a long enough password');
	await page.getByLabel('Repeat the password').fill('a long enough password');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL('/');
	return { context, page, email, name };
}

async function projectMenu(page: Page) {
	await page.getByRole('button', { name: 'Project menu' }).click();
	return page.getByRole('menu');
}

test('sharing a project: a guest edits it but cannot delete or share it; handing it over swaps the roles', async ({ page, browser }) => {
	const ben = await inviteAndJoin(page, browser, uniqueName('Ben'));
	try {
		const projectName = uniqueName('Shared house');
		const url = await createProject(page, projectName);
		await addRoom(page, 'Kitchen');

		// share it: a mistake is explained in the panel, then it works
		await (await projectMenu(page)).getByRole('menuitem', { name: 'Share' }).click();
		const panel = page.getByRole('region', { name: 'Sharing' });
		await expect(panel.getByText('Not shared with anyone yet.')).toBeVisible();
		await panel.getByLabel('Email address').fill('nobody-has-this@example.com');
		await panel.getByRole('button', { name: 'Share', exact: true }).click();
		await expect(panel.getByText('Nobody with that email address has a Mehzur account')).toBeVisible();
		await panel.getByLabel('Email address').fill(ben.email);
		await panel.getByRole('button', { name: 'Share', exact: true }).click();
		await expect(panel.getByText(ben.name, { exact: true })).toBeVisible();

		// the guest finds it under "Shared with me" and can open it
		await visit(ben.page, '/');
		await expect(ben.page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
		const listed = ben.page.getByRole('link', { name: new RegExp(projectName) });
		await expect(listed).toContainText('Shared by E2E Admin');
		await listed.click();
		await expect(roomCard(ben.page, 'Kitchen')).toBeVisible();

		// a guest can change things, but sees no Share and no Delete
		const guestMenu = await projectMenu(ben.page);
		await expect(guestMenu.getByText('Shared by E2E Admin')).toBeVisible();
		await expect(guestMenu.getByRole('menuitem', { name: 'Share' })).toHaveCount(0);
		await guestMenu.getByRole('menuitem', { name: 'Edit project' }).click();
		await expect(ben.page.locator('form.edit')).toBeVisible();
		await expect(ben.page.getByRole('button', { name: 'Delete project' })).toHaveCount(0);
		await ben.page.locator('form.edit').getByRole('button', { name: 'Cancel' }).click();
		await addRoom(ben.page, 'Bath');
		await visit(page, new URL(url).pathname);
		await expect(roomCard(page, 'Bath')).toBeVisible();

		// ...and the server refuses what the page does not offer
		expect((await ben.page.request.post(`${new URL(url).pathname}?/delete`, { headers: { origin: `http://localhost:${PORT}` }, form: {} })).status()).toBe(403);

		// hand the project over: the roles swap
		await (await projectMenu(page)).getByRole('menuitem', { name: 'Share' }).click();
		await page.getByRole('region', { name: 'Sharing' }).getByRole('button', { name: `Hand over to ${ben.name}` }).click();
		await expect.poll(async () => (await projectMenu(page)).getByRole('menuitem', { name: 'Leave project' }).count()).toBe(1);
		await expect(page.getByRole('region', { name: 'Sharing' })).toHaveCount(0);
		await page.keyboard.press('Escape');

		await visit(ben.page, new URL(url).pathname);
		await (await projectMenu(ben.page)).getByRole('menuitem', { name: 'Share' }).click();
		const benPanel = ben.page.getByRole('region', { name: 'Sharing' });
		await expect(benPanel.getByText('E2E Admin')).toBeVisible();

		// the new owner removes the previous one, who is then a stranger
		await benPanel.getByRole('button', { name: 'Stop sharing with E2E Admin' }).click();
		await expect(benPanel.getByText('Not shared with anyone yet.')).toBeVisible();
		expect((await page.request.get(new URL(url).pathname)).status()).toBe(404);
	} finally {
		await ben.context.close();
	}
});

test('a guest can leave a shared project; the owner keeps it', async ({ page, browser }) => {
	const ben = await inviteAndJoin(page, browser, uniqueName('Cleo'));
	try {
		const projectName = uniqueName('Leave me');
		const url = await createProject(page, projectName);
		await (await projectMenu(page)).getByRole('menuitem', { name: 'Share' }).click();
		await page.getByRole('region', { name: 'Sharing' }).getByLabel('Email address').fill(ben.email);
		await page.getByRole('region', { name: 'Sharing' }).getByRole('button', { name: 'Share', exact: true }).click();
		await expect(page.getByRole('region', { name: 'Sharing' }).getByText(ben.name, { exact: true })).toBeVisible();

		await visit(ben.page, new URL(url).pathname);
		await (await projectMenu(ben.page)).getByRole('menuitem', { name: 'Leave project' }).click();
		await expect(ben.page).toHaveURL('/');
		await expect(ben.page.getByRole('link', { name: new RegExp(projectName) })).toHaveCount(0);
		expect((await ben.page.request.get(new URL(url).pathname)).status()).toBe(404);

		await visit(page, new URL(url).pathname);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(projectName);
	} finally {
		await ben.context.close();
	}
});
