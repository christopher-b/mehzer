import { expect, test } from './fixtures';
import {
	deselect,
	expectAllControlsNamed,
	expectReadable,
	measurementDialog,
	photoMenuButton,
	roomMenuButton,
	seedKitchenWithMeasurements,
	startMeasurement,
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

			await page.getByRole('button', { name: '+ Room' }).click();
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
	await page.getByRole('button', { name: '+ Room' }).click();
	await expectAllControlsNamed(page);
});
