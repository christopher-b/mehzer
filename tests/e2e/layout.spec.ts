import { expect, test } from './fixtures';
import {
	addAndOpenPhoto,
	addPhotos,
	addRoom,
	createProject,
	deselect,
	expectFitsViewport,
	expectNoHorizontalOverflow,
	makeImage,
	measurementDialog,
	photoMenuButton,
	roomCard,
	roomMenu,
	roomMenuButton,
	seedKitchenWithMeasurements,
	startMeasurement,
	uniqueName,
	visit,
	waitForPhoto
} from './helpers';

test('pages never scroll sideways', async ({ page }) => {
	await visit(page, '/');
	await expectNoHorizontalOverflow(page);
	const { projectUrl } = await seedKitchenWithMeasurements(page);
	await expectNoHorizontalOverflow(page); // photo page
	await visit(page, projectUrl);
	await expectNoHorizontalOverflow(page);
});

test('the + Room button is centred and large, below the room cards (including No room)', async ({ page }) => {
	await createProject(page, uniqueName('Layout'));
	await addRoom(page, 'Kitchen');
	const button = page.getByRole('button', { name: 'Room', exact: true });
	const box = (await button.boundingBox())!;
	const main = (await page.locator('main').boundingBox())!;
	expect(Math.abs(box.x + box.width / 2 - (main.x + main.width / 2)), 'centred').toBeLessThanOrEqual(2);
	expect(box.height, 'tall enough to tap').toBeGreaterThanOrEqual(48);

	const kitchen = (await roomCard(page, 'Kitchen').boundingBox())!;
	const noRoom = (await roomCard(page, 'No room').boundingBox())!;
	// the cards may sit side by side on a wide screen or stacked on a phone; the button is below both
	expect(box.y).toBeGreaterThanOrEqual(kitchen.y + kitchen.height);
	expect(box.y).toBeGreaterThanOrEqual(noRoom.y + noRoom.height);

	// its popover is centred under it and fits the screen
	await button.click();
	const popover = page.getByRole('dialog', { name: 'Add a room' });
	await expectFitsViewport(page, popover);
	const p = (await popover.boundingBox())!;
	expect(Math.abs(p.x + p.width / 2 - (box.x + box.width / 2))).toBeLessThanOrEqual(2);
});

test('the "+" photo tiles are big, and match the thumbnails\' height', async ({ page }) => {
	await createProject(page, uniqueName('Tiles'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await page.getByRole('link', { name: /Back to/ }).click();

	const tile = roomCard(page, 'Kitchen').locator('.add-photo label');
	const thumb = roomCard(page, 'Kitchen').locator('.grid li:not(.add-photo) img');
	const t = (await tile.boundingBox())!;
	const th = (await thumb.boundingBox())!;
	expect(t.width).toBeGreaterThanOrEqual(100);
	expect(t.height).toBeGreaterThanOrEqual(90);
	expect(Math.abs(t.height - th.height)).toBeLessThanOrEqual(2);
	const plus = (await roomCard(page, 'Kitchen').locator('.add-photo .plus svg').boundingBox())!;
	expect(plus.width).toBeGreaterThanOrEqual(40);
});

test('menus and the hamburger sit inside the screen', async ({ page }) => {
	const { projectUrl } = await seedKitchenWithMeasurements(page);

	// photo page: the hamburger is at the right-hand end of the room row, and its menu fits
	const row = (await page.locator('.room-row').boundingBox())!;
	const burger = (await photoMenuButton(page).boundingBox())!;
	expect(Math.abs(row.x + row.width - (burger.x + burger.width))).toBeLessThanOrEqual(2);
	await photoMenuButton(page).click();
	await expectFitsViewport(page, page.locator('.room-row .menu'));
	await page.keyboard.press('Escape');

	// project page: the room menu (which holds the area form) fits too
	await visit(page, projectUrl);
	await roomMenuButton(page, 'Kitchen').click();
	await expectFitsViewport(page, roomMenu(page, 'Kitchen'));
});

test('Previous / Next sit under the photo, fit the screen and are easy to tap', async ({ page }) => {
	await createProject(page, uniqueName('Nav layout'));
	await addRoom(page, 'Kitchen');
	await addPhotos(page, 'Kitchen', [await makeImage(page, 640, 480), await makeImage(page, 1000, 500)]);
	await waitForPhoto(page);

	const nav = page.getByRole('navigation', { name: 'Photos in Kitchen' });
	const n = (await nav.boundingBox())!;
	const photo = (await page.locator('.canvas').boundingBox())!;
	expect(n.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
	await expectFitsViewport(page, nav);
	const next = (await nav.getByRole('link', { name: /Next/ }).boundingBox())!;
	expect(next.height).toBeGreaterThanOrEqual(48);
});

test('dialogs open at the top of the screen with a margin', async ({ page }) => {
	await seedKitchenWithMeasurements(page);
	await deselect(page); // the last measurement is still selected

	await photoMenuButton(page).click();
	await page.getByRole('menuitem', { name: 'Change room' }).click();
	let box = (await page.getByRole('dialog').boundingBox())!;
	expect(box.y).toBeGreaterThanOrEqual(8);
	expect(box.y).toBeLessThanOrEqual(40);
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();

	await startMeasurement(page, 0.7);
	box = (await measurementDialog(page).boundingBox())!;
	expect(box.y).toBeGreaterThanOrEqual(8);
	expect(box.y).toBeLessThanOrEqual(40);
});

test('the header is the same height with and without the project menu button', async ({ page }) => {
	await createProject(page, uniqueName('Header'));
	await addRoom(page, 'Kitchen');
	const withMenu = (await page.locator('header').first().boundingBox())!.height;
	await expect(page.getByRole('button', { name: 'Project menu' })).toBeVisible();
	await visit(page, '/');
	await expect(page.getByRole('button', { name: 'Project menu' })).toHaveCount(0);
	const without = (await page.locator('header').first().boundingBox())!.height;
	expect(without).toBe(withMenu);
});
