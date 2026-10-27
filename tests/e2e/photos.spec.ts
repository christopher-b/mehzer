import { expect, test } from './fixtures';
import {
	addAndOpenPhoto,
	addPhotos,
	addRoom,
	createProject,
	deselect,
	drawMeasurement,
	isTouch,
	makeImage,
	photoCanvas,
	photoMenuButton,
	roomCard,
	shownPhotoWidth,
	startMeasurement,
	tapAt,
	uniqueName,
	visit,
	waitForPhoto,
	withExifOrientation
} from './helpers';

const gridPhotos = (page: import('@playwright/test').Page, room: string) => roomCard(page, room).locator('.grid li:not(.add-photo)');

test('adding a photo with a room\'s "+" tile opens it, in that room, and a big one is shrunk', async ({ page }) => {
	const name = uniqueName('Upload');
	const projectUrl = await createProject(page, name);
	await addRoom(page, 'Kitchen');

	// a 4000x3000 photo is resized in the browser to a 2560-pixel long side before it is uploaded
	await addPhotos(page, 'Kitchen', await makeImage(page, 4000, 3000));
	await expect(page).toHaveURL(/\/photo\//);
	await waitForPhoto(page);
	expect(await shownPhotoWidth(page)).toBe('2560');
	expect(await page.locator('.canvas img').getAttribute('height')).toBe('1920');

	await expect(page.locator('.room-row')).toContainText('Room: Kitchen');
	await expect(page.getByRole('link', { name: `Back to ${name}` })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);

	// the project page lists it in Kitchen, and the "+" tile is still last
	await page.getByRole('link', { name: `Back to ${name}` }).click();
	await expect(page).toHaveURL(projectUrl);
	await expect(gridPhotos(page, 'Kitchen')).toHaveCount(1);
	await expect(roomCard(page, 'Kitchen').locator('.grid li').last()).toHaveClass(/add-photo/);
	await expect(roomCard(page, 'No room').locator('.grid li:not(.add-photo)')).toHaveCount(0);
});

test('a file that is not an image is refused and you stay on the project page', async ({ page }) => {
	const projectUrl = await createProject(page, uniqueName('Bad file'));
	await addPhotos(page, 'No room', { name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a picture') });
	await expect(page.getByText("Failed: This file couldn't be read as an image.")).toBeVisible();
	await expect(page.getByText('notes.jpg')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Retry/ })).toHaveCount(0);
	await expect(page).toHaveURL(projectUrl);
	await expect(gridPhotos(page, 'No room')).toHaveCount(0);
});

test('several photos added together keep their order and can be flipped through', async ({ page }) => {
	const projectUrl = await createProject(page, uniqueName('Flip'));
	await addRoom(page, 'Kitchen');
	// three photos of different sizes so we can tell them apart: 640, 1000 and 800 wide
	await addPhotos(page, 'Kitchen', [await makeImage(page, 640, 480, 'first'), await makeImage(page, 1000, 500, 'second'), await makeImage(page, 800, 800, 'third')]);
	await expect(page).toHaveURL(/\/photo\//);
	await waitForPhoto(page);

	const nav = page.getByRole('navigation', { name: 'Photos in Kitchen' });
	const count = nav.locator('.nav-count');
	const next = nav.getByRole('link', { name: /Next/ });
	const previous = nav.getByRole('link', { name: /Previous/ });

	// lands on the first one; Previous is disabled, Next is a link
	expect(await shownPhotoWidth(page)).toBe('640');
	await expect(count).toHaveText('1 of 3');
	await expect(previous).toHaveCount(0);
	await expect(nav.locator('[aria-disabled=true]')).toHaveText(/Previous/);
	await expect(page.locator('head link[rel=prefetch]')).toHaveCount(1); // only the next photo to preload

	// leave a measurement selected and move on: nothing carries over
	await drawMeasurement(page, `1'`, { name: 'On first' });
	await expect(page.locator('.annotation.selected')).toHaveCount(1);
	await next.click();
	await expect(count).toHaveText('2 of 3');
	await waitForPhoto(page);
	expect(await shownPhotoWidth(page)).toBe('1000');
	await expect(page.locator('.annotation')).toHaveCount(0);
	await expect(page.locator('aside li')).toHaveCount(0);
	await expect(page.locator('head link[rel=prefetch]')).toHaveCount(2); // both neighbours

	// a half-placed point does not follow you either
	await tapAt(page, 0.3, 0.4);
	await expect(page.getByText(/second point/)).toBeVisible();
	await next.click();
	await expect(count).toHaveText('3 of 3');
	await waitForPhoto(page);
	expect(await shownPhotoWidth(page)).toBe('800');
	await expect(page.getByText(/Tap two points/)).toBeVisible();
	await expect(next).toHaveCount(0);
	await expect(nav.locator('[aria-disabled=true]')).toHaveText(/Next/);

	await previous.click();
	await expect(count).toHaveText('2 of 3');

	// the project page shows them in the same order
	await visit(page, projectUrl);
	const widths = await gridPhotos(page, 'Kitchen').locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('width')));
	expect(widths).toEqual(['640', '1000', '800']);
});

test('the arrow keys flip photos, except while typing, in a dialog, or mid-measurement', async ({ page }) => {
	test.skip(isTouch(), 'keyboard shortcuts');
	await createProject(page, uniqueName('Arrows'));
	await addRoom(page, 'Kitchen');
	await addPhotos(page, 'Kitchen', [await makeImage(page, 640, 480), await makeImage(page, 1000, 500), await makeImage(page, 800, 800)]);
	await waitForPhoto(page);
	const count = page.locator('.photo-nav .nav-count');

	await page.keyboard.press('ArrowRight');
	await expect(count).toHaveText('2 of 3');
	await page.keyboard.press('ArrowRight');
	await expect(count).toHaveText('3 of 3');
	await page.keyboard.press('ArrowRight'); // nothing after the last one
	await expect(count).toHaveText('3 of 3');
	await page.keyboard.press('ArrowLeft');
	await expect(count).toHaveText('2 of 3');
	await page.keyboard.press('ArrowLeft');
	await expect(count).toHaveText('1 of 3');
	await waitForPhoto(page);

	// half-placed point: ignored
	await tapAt(page, 0.2, 0.7);
	await page.keyboard.press('ArrowRight');
	await expect(count).toHaveText('1 of 3');
	await page.keyboard.press('Escape');

	// typing in the measurement field: the arrows move the cursor, not the photo
	await startMeasurement(page, 0.2);
	const field = page.getByRole('dialog').getByLabel(/^Measurement/);
	await field.fill('12');
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('ArrowRight');
	await expect(count).toHaveText('1 of 3');
	await expect(field).toHaveValue('12');
});

test('a room with a single photo shows no Previous / Next', async ({ page }) => {
	await createProject(page, uniqueName('Single'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await expect(page.getByRole('navigation', { name: /Photos in/ })).toHaveCount(0);
});

test('changing a photo\'s room from its menu moves it, and the flip order follows', async ({ page }) => {
	const projectUrl = await createProject(page, uniqueName('Change room'));
	await addRoom(page, 'Kitchen');
	await addRoom(page, 'Bedroom');
	await addPhotos(page, 'Kitchen', [await makeImage(page, 640, 480), await makeImage(page, 1000, 500)]);
	await waitForPhoto(page);
	await expect(page.locator('.photo-nav .nav-count')).toHaveText('1 of 2');

	await photoMenuButton(page).click();
	await page.getByRole('menuitem', { name: 'Change room' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Change room' })).toBeVisible();
	await dialog.getByRole('combobox').selectOption({ label: 'Bedroom' });
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();

	await expect(page.locator('.room-row')).toContainText('Room: Bedroom');
	await expect(page.getByRole('navigation', { name: /Photos in/ })).toHaveCount(0); // alone in Bedroom now

	await visit(page, projectUrl);
	await expect(gridPhotos(page, 'Kitchen')).toHaveCount(1);
	await expect(gridPhotos(page, 'Bedroom')).toHaveCount(1);
});

test('deleting a photo from its menu: cancel keeps it, OK removes it, its measurements and its file', async ({ page, confirmations }) => {
	const projectUrl = await createProject(page, uniqueName('Delete photo'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await drawMeasurement(page, `8'`, { name: 'Doomed' });
	const photoUrl = page.url();
	const source = (await page.locator('.canvas img').getAttribute('src'))!;
	expect((await page.request.get(source)).status()).toBe(200);

	confirmations.answer = false;
	await photoMenuButton(page).click();
	await page.getByRole('menuitem', { name: 'Delete photo' }).click();
	await expect(page).toHaveURL(photoUrl);
	await expect(page.getByText('Doomed').first()).toBeVisible();

	confirmations.answer = true; // the menu is still open after declining
	await page.getByRole('menuitem', { name: 'Delete photo' }).click();
	await expect(page).toHaveURL(projectUrl);
	await expect(gridPhotos(page, 'Kitchen')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Measurements' })).toHaveCount(0); // its measurement went with it
	expect((await page.request.get(source)).status()).toBe(404);
	expect((await page.request.get(photoUrl)).status()).toBe(404);
});

test('the \u2715 on a thumbnail deletes that photo, after a confirmation', async ({ page, confirmations }) => {
	await createProject(page, uniqueName('Thumb x'));
	await addAndOpenPhoto(page, 'No room');
	await page.getByRole('link', { name: /Back to/ }).click();
	await expect(gridPhotos(page, 'No room')).toHaveCount(1);

	const remove = roomCard(page, 'No room').getByRole('button', { name: 'Delete photo' });
	const box = (await remove.boundingBox())!;
	expect(box.width).toBeGreaterThanOrEqual(32);
	expect(box.height).toBeGreaterThanOrEqual(32);

	confirmations.answer = false;
	await remove.click();
	await expect(gridPhotos(page, 'No room')).toHaveCount(1);
	confirmations.answer = true;
	await remove.click();
	await expect(gridPhotos(page, 'No room')).toHaveCount(0);
});

/** Holds every photo upload for a while, so there is time to do something else meanwhile. */
async function slowUploads(page: import('@playwright/test').Page, ms = 4000) {
	await page.route('**/api/projects/*/photos', async (route) => {
		const response = await route.fetch();
		await new Promise((resolve) => setTimeout(resolve, ms));
		await route.fulfill({ response }).catch(() => {});
	});
}

test('leaving while photos upload asks first; leaving anyway ends the upload and stays away', async ({ page }) => {
	await createProject(page, uniqueName('Leave'));
	await addRoom(page, 'Kitchen');
	await slowUploads(page);
	const prompts: string[] = [];
	page.on('dialog', (dialog) => prompts.push(dialog.message()));

	await addPhotos(page, 'Kitchen', await makeImage(page, 640, 480));
	await page.getByRole('link', { name: 'Mehzur', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	expect(prompts).toEqual(['Photos are still uploading. Leave anyway?']);

	// the upload that was in flight must not pull us to its photo afterwards
	await page.waitForTimeout(6000);
	await expect(page).toHaveURL(/\/$/);
});

test('answering Cancel to the prompt keeps you on the project page, and the upload finishes', async ({ page, confirmations, browserName }) => {
	await createProject(page, uniqueName('Stay'));
	await addRoom(page, 'Kitchen');
	await slowUploads(page, 1500);
	confirmations.answer = false;

	await addPhotos(page, 'Kitchen', await makeImage(page, 640, 480));
	await page.getByRole('link', { name: 'Mehzur', exact: true }).click();
	await expect(page).toHaveURL(/\/p\/[0-9a-f-]+$/);
	// WebKit hands the server an empty body for an upload held by `page.route`, so only Chromium can finish it
	if (browserName === 'chromium') await expect(page).toHaveURL(/\/photo\//, { timeout: 15_000 });
});

test('a photo taken with the phone upright (EXIF orientation 6) is stored upright', async ({ page }) => {
	await createProject(page, uniqueName('Orientation'));
	await addRoom(page, 'Kitchen');
	await addPhotos(page, 'Kitchen', withExifOrientation(await makeImage(page, 640, 480), 6));
	await expect(page).toHaveURL(/\/photo\//);
	await waitForPhoto(page);
	expect(await shownPhotoWidth(page)).toBe('480');
	expect(await page.locator('.canvas img').getAttribute('height')).toBe('640');
});
