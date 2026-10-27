import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { PORT } from './constants';
import { addRoom, createProject, editProjectDialog, inviteAndJoin, roomCard, shareProjectDialog, uniqueName, visit } from './helpers';

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
		const panel = shareProjectDialog(page);
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
		const benEdit = editProjectDialog(ben.page);
		await expect(benEdit).toBeVisible();
		await expect(benEdit.getByRole('button', { name: 'Delete project' })).toHaveCount(0);
		await benEdit.getByRole('button', { name: 'Cancel' }).click();
		await addRoom(ben.page, 'Bath');
		await visit(page, new URL(url).pathname);
		await expect(roomCard(page, 'Bath')).toBeVisible();

		// ...and the server refuses what the page does not offer
		expect((await ben.page.request.post(`${new URL(url).pathname}?/delete`, { headers: { origin: `http://localhost:${PORT}` }, form: {} })).status()).toBe(403);

		// hand the project over: the roles swap
		await (await projectMenu(page)).getByRole('menuitem', { name: 'Share' }).click();
		await shareProjectDialog(page).getByRole('button', { name: `Hand over to ${ben.name}` }).click();
		await expect.poll(async () => (await projectMenu(page)).getByRole('menuitem', { name: 'Leave project' }).count()).toBe(1);
		await expect(shareProjectDialog(page)).toHaveCount(0);
		await page.keyboard.press('Escape');

		await visit(ben.page, new URL(url).pathname);
		await (await projectMenu(ben.page)).getByRole('menuitem', { name: 'Share' }).click();
		const benPanel = shareProjectDialog(ben.page);
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
		await shareProjectDialog(page).getByLabel('Email address').fill(ben.email);
		await shareProjectDialog(page).getByRole('button', { name: 'Share', exact: true }).click();
		await expect(shareProjectDialog(page).getByText(ben.name, { exact: true })).toBeVisible();

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
