import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import {
	createProject,
	deleteCurrentProject,
	expectNoHorizontalOverflow,
	seedKitchenWithMeasurements,
	uniqueName,
	visit,
	projectMenuItem
} from './helpers';

const headerTitle = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1 });

/** The project menu, beside the project name in the header, shows the project's units. */
async function expectUnitsInMenu(page: Page, units: string) {
	await page.getByRole('button', { name: 'Project menu' }).click();
	await expect(page.getByRole('menu').getByText(`Units: ${units}`)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toBeHidden();
}

test('create a project, see it listed, rename it and change its units, then delete it', async ({ page }) => {
	const name = uniqueName('Elm St');
	await createProject(page, name);

	// the project name lives in the header, beside the site title, and nowhere else as a heading
	await expect(headerTitle(page)).toHaveText(name);
	await expect(page.locator('main h1')).toHaveCount(0);
	await expectUnitsInMenu(page, 'ft/in');
	await expect(page.getByRole('link', { name: 'Mehzur', exact: true })).toBeVisible();

	// it appears on the home page with its units and photo count
	await visit(page, '/');
	const listed = page.getByRole('link', { name: new RegExp(name) });
	await expect(listed).toContainText('0 photos · 0 rooms · ft/in');
	await listed.click();
	await expect(headerTitle(page)).toHaveText(name);

	// rename and switch to metric: the header follows
	await projectMenuItem(page, 'Edit project');
	const form = page.locator('form.edit');
	await form.getByLabel('Name', { exact: true }).fill(`${name} (renamed)`);
	await form.getByLabel('Units').selectOption('metric');
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(headerTitle(page)).toHaveText(`${name} (renamed)`);
	await expectUnitsInMenu(page, 'm/cm');
	await expect(form).toBeHidden();

	await deleteCurrentProject(page);
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
});

test('Cancel leaves the project unchanged', async ({ page }) => {
	const name = uniqueName('Cancel');
	await createProject(page, name);
	await projectMenuItem(page, 'Edit project');
	await page.locator('form.edit').getByLabel('Name', { exact: true }).fill('something else');
	await page.locator('form.edit').getByRole('button', { name: 'Cancel' }).click();
	await expect(headerTitle(page)).toHaveText(name);
});

test('deleting a project can be cancelled at the confirmation', async ({ page, confirmations }) => {
	const name = uniqueName('Keep me');
	await createProject(page, name);
	confirmations.answer = false;
	await projectMenuItem(page, 'Edit project');
	await page.getByRole('button', { name: 'Delete project' }).click();
	await expect(headerTitle(page)).toHaveText(name); // still here
	confirmations.answer = true;
	await page.getByRole('button', { name: 'Delete project' }).click();
	await expect(page).toHaveURL('/');
});

test('a very long project name shortens in the header without pushing the account menu away', async ({ page }) => {
	await createProject(page, `The Very Long Named Cottage By The Lake With A Boathouse ${uniqueName('x')}`);
	const account = page.getByRole('button', { name: 'Account menu' });
	const box = (await account.boundingBox())!;
	expect(box.height, 'the account name stays on one line').toBeLessThan(30);
	expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
	await expectNoHorizontalOverflow(page);
	await deleteCurrentProject(page);
});

test('the header shows the project on the project page and the photo page, and links back', async ({ page }) => {
	const name = uniqueName('Header');
	await createProject(page, name);
	await expect(page.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
	await visit(page, '/');
	await expect(page.getByRole('heading', { level: 1, name })).toHaveCount(0); // not on the home page
});

test('a project can be exported as CSV and as PDF', async ({ page }) => {
	const { projectUrl } = await seedKitchenWithMeasurements(page);
	await visit(page, projectUrl);

	const csvDownload = page.waitForEvent('download');
	await projectMenuItem(page, 'Export CSV');
	const csv = await csvDownload;
	expect(csv.suggestedFilename()).toMatch(/\.csv$/);
	const csvText = await readFile((await csv.path())!, 'utf8');
	expect(csvText).toContain('Room,Room area,Photo,Measurement,Value,Value (mm)');
	expect(csvText).toContain("Kitchen,,1,Length,12',3658");

	const pdfDownload = page.waitForEvent('download');
	await projectMenuItem(page, 'Export PDF');
	const pdf = await pdfDownload;
	expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
	const pdfBytes = await readFile((await pdf.path())!);
	expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
	const pdfText = pdfBytes.toString('latin1');
	expect(pdfText).toContain('/Filter /DCTDecode'); // the photo is embedded
	expect(pdfText).toContain('(Length: 12\') Tj'); // with its measurement drawn on
});
