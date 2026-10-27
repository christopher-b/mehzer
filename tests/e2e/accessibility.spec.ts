import { expect, test } from './fixtures';
import {
	createProject,
	deselect,
	expectAllControlsNamed,
	expectReadable,
	measurementDialog,
	photoMenuButton,
	roomMenuButton,
	seedKitchenWithMeasurements,
	startMeasurement,
	uniqueName,
	visit
} from './helpers';

// The app is light-only; these run under both colour-scheme preferences to prove the phone's setting
// cannot make text unreadable.
for (const colorScheme of ['light', 'dark'] as const) {
	test.describe(`${colorScheme} colour-scheme preference`, () => {
		test.use({ colorScheme });

		test('the project page, its room menu and its add-room popover are readable', async ({ page }) => {
			const { projectUrl } = await seedKitchenWithMeasurements(page);
			await visit(page, projectUrl);
			await expectReadable(page);

			await roomMenuButton(page, 'Kitchen').click();
			await expectReadable(page);
			await page.keyboard.press('Escape');

			await page.getByRole('button', { name: 'Room', exact: true }).click();
			await expectReadable(page);
		});

		test('the photo page, its menu and both dialogs are readable', async ({ page }) => {
			await seedKitchenWithMeasurements(page); // leaves us on the photo page
			await expectReadable(page);

			await photoMenuButton(page).click();
			await expectReadable(page);
			await page.getByRole('menuitem', { name: 'Change room' }).click();
			await expectReadable(page);
			await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

			await deselect(page); // the last measurement is still selected
			await startMeasurement(page, 0.7);
			await expectReadable(page);
			await expect(measurementDialog(page)).toBeVisible();
		});
	});
}

test('the account and users pages, and the account menu, are readable and every control is named', async ({ page }) => {
	for (const path of ['/account', '/admin/users']) {
		await visit(page, path);
		await expectReadable(page);
		await expectAllControlsNamed(page);
	}
	await page.getByRole('button', { name: 'Account menu' }).click();
	await expectReadable(page);
	await expectAllControlsNamed(page);
});

test('every control has an accessible name (home, project and photo pages, and dialogs)', async ({ page }) => {
	await visit(page, '/');
	await expectAllControlsNamed(page);

	const { projectUrl } = await seedKitchenWithMeasurements(page);
	await expectAllControlsNamed(page); // photo page
	await photoMenuButton(page).click();
	await expectAllControlsNamed(page);
	await page.keyboard.press('Escape');

	await visit(page, projectUrl);
	await expectAllControlsNamed(page);
	await roomMenuButton(page, 'Kitchen').click();
	await expectAllControlsNamed(page);
	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'Room', exact: true }).click();
	await expectAllControlsNamed(page);
});

test('a status message is written into a region that was already on the page', async ({ page }) => {
	await visit(page, '/account');
	const section = page.locator('section', { has: page.getByRole('heading', { name: 'Name', exact: true }) });
	const status = section.locator('[role=status]');
	await expect(status).toBeAttached();
	await expect(status).toHaveText('');
	const handle = await status.elementHandle();
	await section.getByRole('button', { name: 'Save name' }).click();
	await expect(status).toHaveText('Saved.');
	expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
});

test('menu keys: Home and End jump to the ends, and tabbing out closes the menu', async ({ page }) => {
	await createProject(page, uniqueName('Menu keys'));
	await page.getByRole('button', { name: 'Project menu' }).click();
	const items = page.getByRole('menuitem');
	const count = await items.count();
	await page.keyboard.press('End');
	await expect(items.nth(count - 1)).toBeFocused();
	await page.keyboard.press('Home');
	await expect(items.first()).toBeFocused();

	await page.keyboard.press('End');
	await page.keyboard.press('Tab');
	await expect(items.first()).toBeHidden();
});

test('the account and users pages each have one h1', async ({ page }) => {
	for (const url of ['/account', '/admin/users']) {
		await visit(page, url);
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	}
});

test('a ?select= that matches no measurement selects nothing', async ({ page }) => {
	await seedKitchenWithMeasurements(page);
	await visit(page, page.url().split('?')[0] + '?select=nope');
	await expect(page.getByText('Tap two points on the photo to add a measurement.')).toBeVisible();
});

test.describe('signed out', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('a wrong sign-in is announced as an alert', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill('nobody@example.com');
		await page.getByLabel('Password').fill('not the password');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page.getByRole('alert').getByText('Incorrect email or password')).toBeVisible();
	});
});
