import { expect, test } from './fixtures';
import {
	addAndOpenPhoto,
	addPhotos,
	addRoom,
	createProject,
	deselect,
	dragHandle,
	drawMeasurement,
	editProjectDialog,
	isTouch,
	makeImage,
	measurementDialog,
	measurementField,
	photoMenuButton,
	reload,
	roomCard,
	roomMenu,
	roomMenuButton,
	seedKitchenWithMeasurements,
	startMeasurement,
	uniqueName,
	visit,
	waitForPhoto,
	projectMenuItem
} from './helpers';

const aside = (page: import('@playwright/test').Page) => page.getByRole('complementary');

test('drawing a measurement: number pad, helper keys, preview, optional name, saved label', async ({ page }) => {
	await createProject(page, uniqueName('Draw'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');

	await startMeasurement(page);
	const dialog = measurementDialog(page);
	const field = measurementField(page);

	// the dialog sits at the top with a margin, and the number pad is the default keyboard
	const box = (await dialog.boundingBox())!;
	expect(box.y).toBeGreaterThanOrEqual(8);
	expect(box.y).toBeLessThanOrEqual(40);
	await expect(field).toBeFocused();
	await expect(field).toHaveAttribute('inputmode', 'decimal');

	// the helper keys type feet and inches at the cursor without taking focus away
	await field.fill('12');
	await dialog.getByRole('button', { name: 'feet', exact: true }).click();
	await expect(field).toBeFocused();
	await page.keyboard.type('6');
	await dialog.getByRole('button', { name: 'inches', exact: true }).click();
	await expect(field).toHaveValue(`12'6"`);
	await expect(dialog.getByText(`= 12' 6"`)).toBeVisible();
	// the hint describes the field; it is not part of the field's name
	await expect(field).toHaveAccessibleName('Measurement');
	await expect(field).toHaveAccessibleDescription(`= 12' 6"`);

	// ABC / 123 switches to the full keyboard and back
	await dialog.getByRole('button', { name: 'ABC' }).click();
	await expect(field).toHaveAttribute('inputmode', 'text');
	await expect(dialog.getByRole('button', { name: '123', pressed: true })).toBeVisible();
	await dialog.getByRole('button', { name: '123' }).click();
	await expect(field).toHaveAttribute('inputmode', 'decimal');

	// "(optional)" sits on the same line as "Name", above the field
	const nameField = dialog.getByLabel(/^Name/);
	const nameText = dialog.locator('label', { hasText: /^Name/ }).locator('> span').first();
	await expect(nameText).toHaveText('Name (optional)');
	const text = (await nameText.boundingBox())!;
	const optional = (await dialog.locator('.optional').boundingBox())!;
	const input = (await nameField.boundingBox())!;
	expect(Math.abs(optional.y - text.y)).toBeLessThan(4);
	expect(optional.x).toBeGreaterThan(text.x);
	expect(optional.y + optional.height).toBeLessThanOrEqual(input.y);

	// fractions, a name, and Save: the label appears on the photo and in the list
	await field.fill(`12' 6 1/2"`);
	await nameField.fill('Kitchen length');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('.annotation text')).toHaveText(`Kitchen length: 12' 6 1/2"`);
	await expect(aside(page).getByRole('listitem')).toContainText(['Kitchen length']);
	await expect(aside(page).getByRole('listitem')).toContainText([`12' 6 1/2"`]);
	await expect(page.locator('.annotation.selected')).toHaveCount(1);

	// the next dialog opens on the number pad again
	await deselect(page);
	await startMeasurement(page, 0.6);
	await expect(measurementField(page)).toHaveAttribute('inputmode', 'decimal');
});

test('an unreadable value is flagged and not saved; a name alone is fine', async ({ page }) => {
	await createProject(page, uniqueName('Bad value'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');

	await startMeasurement(page);
	const dialog = measurementDialog(page);
	await measurementField(page).fill('banana');
	await expect(dialog.getByText('Not recognised')).toBeVisible();
	await expect(measurementField(page)).toHaveAttribute('aria-invalid', 'true');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog.getByText(/Couldn't understand/)).toBeVisible();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.locator('.annotation')).toHaveCount(0);
	await expect(aside(page).getByText('None yet.')).toBeVisible();

	// no value at all is allowed: it shows "?" until you fill it in
	await startMeasurement(page);
	await measurementDialog(page).getByLabel(/^Name/).fill('Later');
	await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('.annotation text')).toHaveText('Later: ?');
});

test('edit a measurement from the list, then delete it (cancel first)', async ({ page, confirmations }) => {
	await createProject(page, uniqueName('Edit'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await drawMeasurement(page, `12'`, { name: 'Wall' });

	// each row's buttons say which measurement they act on, and the row says whether it is selected
	await expect(aside(page).getByRole('button', { name: 'Delete Wall', exact: true })).toBeVisible();
	await expect(aside(page).getByRole('button', { name: /^Wall/, pressed: true })).toBeVisible();
	await aside(page).getByRole('button', { name: 'Edit Wall', exact: true }).click();
	const dialog = measurementDialog(page);
	await expect(dialog.getByRole('heading', { name: 'Edit measurement' })).toBeVisible();
	await expect(measurementField(page)).toHaveValue(`12'`);
	await measurementField(page).fill('150in');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('.annotation text')).toHaveText(`Wall: 12' 6"`);

	confirmations.answer = false;
	await aside(page).getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('.annotation')).toHaveCount(1);
	confirmations.answer = true;
	await aside(page).getByRole('button', { name: 'Delete' }).click();
	await expect(page.locator('.annotation')).toHaveCount(0);
	await expect(aside(page).getByText('None yet.')).toBeVisible();
});

test('dragging an end point moves the measurement and the change is saved', async ({ page }) => {
	await createProject(page, uniqueName('Drag'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen', 640, 480);
	await drawMeasurement(page, `12'`, { y: 0.3 });
	await expect(page.locator('.handle')).toHaveCount(2); // selected, so handles show

	await dragHandle(page, 1, 0.8, 0.5);
	await expect(async () => {
		await reload(page);
		await waitForPhoto(page);
		const stroke = page.locator('.annotation .stroke');
		const x2 = Number(await stroke.getAttribute('x2'));
		const y2 = Number(await stroke.getAttribute('y2'));
		expect(Math.abs(x2 - 0.8 * 640)).toBeLessThan(3);
		expect(Math.abs(y2 - 0.5 * 480)).toBeLessThan(3);
	}).toPass();
});

test('dragging a line twice quickly: a slow first save does not undo the second drag', async ({ page }) => {
	test.skip(isTouch(), 'mouse drags');
	await createProject(page, uniqueName('Drag twice'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen', 640, 480);
	await drawMeasurement(page, `12'`, { y: 0.3 });

	// the first save answers after 1.5 s, the second after 3 s
	const delays = [1500, 3000];
	await page.route(/\?\/move/, async (route) => {
		const response = await route.fetch();
		await new Promise((resolve) => setTimeout(resolve, delays.shift() ?? 0));
		await route.fulfill({ response }).catch(() => {});
	});
	await dragHandle(page, 1, 0.8, 0.5);
	await dragHandle(page, 1, 0.6, 0.7);

	const stroke = page.locator('.annotation .stroke');
	const expectAtSecondDrag = async () => {
		expect(Math.abs(Number(await stroke.getAttribute('x2')) - 0.6 * 640)).toBeLessThan(3);
		expect(Math.abs(Number(await stroke.getAttribute('y2')) - 0.7 * 480)).toBeLessThan(3);
	};
	await page.waitForTimeout(2200); // the first save has answered, the second has not
	await expectAtSecondDrag();
	await page.waitForTimeout(1500);
	await expectAtSecondDrag();
	await reload(page);
	await waitForPhoto(page);
	await expectAtSecondDrag();
});

test('a metric project reads a bare number as metres and offers metric unit keys', async ({ page }) => {
	await createProject(page, uniqueName('Metric'), 'metric');
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');

	await drawMeasurement(page, '3.25');
	await expect(page.locator('.annotation text')).toHaveText('3.25 m');
	await deselect(page);

	await startMeasurement(page, 0.6);
	const dialog = measurementDialog(page);
	await expect(dialog.getByRole('button', { name: /^(m|cm|mm)$/ })).toHaveText(['m', 'cm', 'mm']);
	await expect(dialog.getByRole('button', { name: 'feet', exact: true })).toHaveCount(0);
	await measurementField(page).fill('320');
	await dialog.getByRole('button', { name: 'cm', exact: true }).click();
	await expect(dialog.getByText('= 3.2 m')).toBeVisible();
});

test('a room\'s area comes from two of its measurements, shown in the card and set from its menu', async ({ page }) => {
	const { projectUrl, photoUrl } = await seedKitchenWithMeasurements(page);
	await visit(page, projectUrl);
	await addRoom(page, 'Bedroom');

	// the Measurements section now exists; no area yet; a room with fewer than two has no area form
	await expect(page.getByRole('heading', { name: 'Measurements', level: 2 })).toBeVisible();
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveCount(0);
	await roomMenuButton(page, 'Bedroom').click();
	await expect(roomMenu(page, 'Bedroom').getByRole('button', { name: 'Calculate' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// the area selectors are in the menu, not in the card body
	await expect(roomCard(page, 'Kitchen').getByRole('button', { name: 'Calculate' })).toBeHidden();
	await roomMenuButton(page, 'Kitchen').click();
	const menu = roomMenu(page, 'Kitchen');
	const first = menu.getByLabel('First measurement (length)');
	const second = menu.getByLabel('Second measurement (width)');

	// the same measurement twice is refused inside the menu, which stays open
	await first.selectOption({ label: `Length · 12'` });
	await second.selectOption({ label: `Length · 12'` });
	await menu.getByRole('button', { name: 'Calculate' }).click();
	await expect(menu.getByText(/different/)).toBeVisible();
	await expect(menu).toBeVisible();

	// a valid pair closes the menu and shows the area
	await second.selectOption({ label: `Width · 10'` });
	await menu.getByRole('button', { name: 'Calculate' }).click();
	await expect(menu).toBeHidden();
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveText('120.0 ft²');

	// it persists, and the menu remembers the pair
	await reload(page);
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveText('120.0 ft²');
	await roomMenuButton(page, 'Kitchen').click();
	await expect(roomMenu(page, 'Kitchen').getByLabel('First measurement (length)')).toHaveValue(/.+/);
	await page.keyboard.press('Escape');

	// units are a display choice: the same area in a metric project
	await projectMenuItem(page, 'Edit project');
	await editProjectDialog(page).getByLabel('Units').selectOption('metric');
	await editProjectDialog(page).getByRole('button', { name: 'Save' }).click();
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveText('11.15 m²');
	await projectMenuItem(page, 'Edit project');
	await editProjectDialog(page).getByLabel('Units').selectOption('imperial');
	await editProjectDialog(page).getByRole('button', { name: 'Save' }).click();
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveText('120.0 ft²');

	// moving the photo to another room clears the area, and moving it back does not resurrect it
	await visit(page, photoUrl);
	await waitForPhoto(page);
	for (const room of ['Bedroom', 'Kitchen']) {
		await photoMenuButton(page).click();
		await page.getByRole('menuitem', { name: 'Change room' }).click();
		await page.getByRole('dialog').getByRole('combobox').selectOption({ label: room });
		await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('.room-row')).toContainText(`Room: ${room}`);
	}
	await visit(page, projectUrl);
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveCount(0);
});

test('a metric room area is shown in square metres', async ({ page }) => {
	const { projectUrl } = await seedKitchenWithMeasurements(page, 'metric');
	await visit(page, projectUrl);
	await roomMenuButton(page, 'Kitchen').click();
	const menu = roomMenu(page, 'Kitchen');
	await menu.getByLabel('First measurement (length)').selectOption({ label: 'Length · 3.5 m' });
	await menu.getByLabel('Second measurement (width)').selectOption({ label: 'Width · 3 m' });
	await menu.getByRole('button', { name: 'Calculate' }).click();
	await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveText('10.50 m²');
});

test('measurements are listed on the project page, filterable by room, and open their photo', async ({ page }) => {
	const { projectUrl } = await seedKitchenWithMeasurements(page);
	await visit(page, projectUrl);
	await addRoom(page, 'Bedroom');
	await addPhotos(page, 'Bedroom', await makeImage(page, 800, 600));
	await waitForPhoto(page);
	await drawMeasurement(page, `8'`, { name: 'Closet' });
	await visit(page, projectUrl);

	const rows = page.getByRole('region', { name: 'Measurements' }).getByRole('listitem');
	await expect(rows).toHaveCount(3);
	await expect(rows.filter({ hasText: 'Closet' })).toContainText('Bedroom');
	await expect(rows.filter({ hasText: 'Length' })).toContainText(`12'`);

	const filter = page.getByLabel('Filter by room');
	await filter.selectOption({ label: 'Bedroom' });
	await expect(rows).toHaveCount(1);
	await filter.selectOption({ label: 'Kitchen' });
	await expect(rows).toHaveCount(2);
	await filter.selectOption({ label: 'No room' });
	await expect(rows).toHaveCount(0);
	await expect(page.getByText('No measurements match this filter.')).toBeVisible();
	await filter.selectOption({ label: 'All rooms' });
	await expect(rows).toHaveCount(3);

	// a row opens its photo with that measurement selected
	await rows.filter({ hasText: 'Closet' }).click();
	await expect(page).toHaveURL(/\/photo\//);
	await waitForPhoto(page);
	await expect(page.locator('.annotation.selected text')).toHaveText(`Closet: 8'`);
});

test('Enter on a photo-menu item opens its action, not the measurement editor', async ({ page }) => {
	test.skip(isTouch(), 'keyboard shortcuts');
	await createProject(page, uniqueName('Enter'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await drawMeasurement(page, `12'`); // stays selected
	await photoMenuButton(page).click();
	await page.keyboard.press('Enter'); // the first menu item has focus: Change room
	await expect(page.getByRole('dialog').getByRole('heading', { name: 'Change room' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Edit measurement' })).toHaveCount(0);
});

test('Enter on a focused list button only presses that button', async ({ page, confirmations }) => {
	test.skip(isTouch(), 'keyboard shortcuts');
	await createProject(page, uniqueName('Enter button'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await drawMeasurement(page, `12'`); // stays selected

	await aside(page).getByRole('button', { name: 'Edit' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog').getByRole('heading', { name: 'Edit measurement' })).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

	confirmations.answer = true;
	await aside(page).getByRole('button', { name: 'Delete' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.annotation')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Edit measurement' })).toHaveCount(0);
});
