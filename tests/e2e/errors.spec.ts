import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
	addRoom,
	addAndOpenPhoto,
	addPhotos,
	makeImage,
	shownPhotoWidth,
	waitForPhoto,
	createProject,
	photoCanvas,
	photoMenuButton,
	roomCard,
	deselect,
	dragHandle,
	expectReadable,
	expectNoTechnicalText,
	expireSession,
	failAction,
	goOffline,
	goOnline,
	measurementDialog,
	measurementField,
	roomMenu,
	roomMenuButton,
	seedKitchenWithMeasurements,
	reload,
	recordShownMessages,
	startMeasurement,
	uniqueName,
	visit,
	waitForHydration,
	projectMenuItem,
	signIn
} from './helpers';

// The baseline failures measured before error handling was built, as tests that are expected to fail until the task
// named on each one fixes the behaviour. Each task flips its rows from `test.fail()` to normal tests.

async function signInAgain(page: Page, goToLogin = false) {
	if (goToLogin) await page.goto('/login');
	await signIn(page);
}

test.beforeEach(({ page }) => recordShownMessages(page));
test.afterEach(({ page }) => expectNoTechnicalText(page));

const gridCount = (page: Page) => page.locator('.grid li:not(.add-photo)');

const FAILURE_PAGE = /Something went wrong|Internal/;

test.describe('failures that should never be silent (baseline)', () => {
	test('E3: an expired session while saving a measurement keeps the dialog and the value', async ({ page, context }) => {
		await seedKitchenWithMeasurements(page);
		await deselect(page);
		await startMeasurement(page, 0.7);
		await measurementField(page).fill(`8'`);
		await expireSession(context);
		await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
		await expect(measurementDialog(page)).toBeVisible();
		await expect(measurementField(page)).toHaveValue(`8'`);
	});

	test('E3: saving a measurement offline shows the offline wording', async ({ page, context }) => {
		await seedKitchenWithMeasurements(page);
		await deselect(page);
		await startMeasurement(page, 0.7);
		await measurementField(page).fill(`8'`);
		await goOffline(context);
		await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
		await expect(measurementDialog(page).getByText("You're offline. Check your connection and try again.")).toBeVisible();
		await goOnline(context);
		await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
		await expect(measurementDialog(page)).toBeHidden();
	});

	test('E3: a server error while dragging an end point is explained, with a retry', async ({ page }) => {
		await seedKitchenWithMeasurements(page);
		await failAction(page, 'move', 'server');
		await dragHandle(page, 0, 0.3, 0.3);
		await expect(page.getByText("Couldn't save the new position.")).toBeVisible();
		await expect(page.getByText(/JSON|token/i)).toHaveCount(0);
		await expect(page.getByRole('alert').getByRole('button', { name: 'Retry' })).toBeVisible();

		// retrying after the server recovers saves the same position without dragging again
		await page.unroute('**/*?/move');
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect(page.getByRole('status').getByText('Saved')).toBeVisible();
		await expect(page.getByRole('alert').getByText("Couldn't save")).toHaveCount(0);
		await reload(page);
		await expect(page.locator('.annotation').first()).toBeVisible();
	});

	test('E3: an error notification can be dismissed', async ({ page }) => {
		await seedKitchenWithMeasurements(page);
		await failAction(page, 'move', 'server');
		await dragHandle(page, 0, 0.3, 0.3);
		const alert = page.getByRole('alert').getByText("Couldn't save the new position.");
		await expect(alert).toBeVisible();
		await expectReadable(page);
		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect(alert).toBeHidden();
		await page.unroute('**/*?/move');
	});

	test('E3: deleting a measurement that was deleted elsewhere refreshes the list', async ({ page, context }) => {
		const { photoUrl } = await seedKitchenWithMeasurements(page);
		const other = await context.newPage();
		other.on('dialog', (d) => d.accept());
		await visit(other, photoUrl);
		const row = (p: Page) => p.locator('aside li', { hasText: 'Length' }).getByRole('button', { name: 'Delete' });
		await row(other).click();
		await expect(other.locator('aside li', { hasText: 'Length' })).toHaveCount(0);
		await row(page).click();
		await expect(page.getByRole('alert').getByText('That item no longer exists. It may have been deleted.')).toBeVisible();
		await expect(page.locator('aside li', { hasText: 'Length' })).toHaveCount(0);
		await expect(page.locator('aside li', { hasText: 'Width' })).toBeVisible();
	});

	test('E5: an expired session while adding a room asks to sign in, then restores the name', async ({ page, context }) => {
		const projectUrl = await createProject(page, uniqueName('Expired room'));
		await page.getByRole('button', { name: 'Room', exact: true }).click();
		const popover = page.getByRole('dialog', { name: 'Add a room' });
		await popover.getByLabel('Room name').fill('Kitchen');
		await expireSession(context);
		await popover.getByRole('button', { name: 'Add room' }).click();
		const prompt = page.getByRole('dialog', { name: 'Signed out' });
		await expect(prompt).toBeVisible();
		await expect(prompt.getByText('Your session has expired. Sign in again to continue.')).toBeVisible();
		await expect(prompt.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/login?next=${encodeURIComponent(new URL(projectUrl).pathname)}`);

		await prompt.getByRole('link', { name: 'Sign in' }).click();
		await signInAgain(page);
		await expect(page).toHaveURL(projectUrl);
		await waitForHydration(page);
		await expect(popover.getByLabel('Room name')).toHaveValue('Kitchen');
		await popover.getByRole('button', { name: 'Add room' }).click();
		await expect(roomCard(page, 'Kitchen')).toBeVisible();
	});

	test('E5: an expired session while saving a measurement keeps it for after signing in', async ({ page, context }) => {
		const { photoUrl } = await seedKitchenWithMeasurements(page);
		await deselect(page);
		await startMeasurement(page, 0.7);
		await measurementField(page).fill(`8'`);
		await expireSession(context);
		await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
		const prompt = page.getByRole('dialog', { name: 'Signed out' });
		await expect(prompt).toBeVisible();
		await expect(prompt.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', /^\/login\?next=[^?]*$/);
		await prompt.getByRole('link', { name: 'Sign in' }).click();
		await signInAgain(page);
		await expect(page).toHaveURL(photoUrl);
		await waitForHydration(page);
		await expect(measurementField(page)).toHaveValue(`8'`);
		await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
		await expect(measurementDialog(page)).toBeHidden();
		await expect(page.locator('aside li')).toHaveCount(3);
	});

	test('E5: an expired session on a scripted delete and on an enhanced form opens the prompt', async ({ page, context }) => {
		const { projectUrl } = await seedKitchenWithMeasurements(page);
		await expireSession(context);
		await page.locator('aside li', { hasText: 'Length' }).getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog', { name: 'Signed out' })).toBeVisible();
		await page.getByRole('dialog', { name: 'Signed out' }).getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByRole('dialog', { name: 'Signed out' })).toBeHidden();
		await expect(page.locator('aside li', { hasText: 'Length' })).toBeVisible();

		await signInAgain(page, true);
		await visit(page, projectUrl);
		await expireSession(context);
		await roomMenuButton(page, 'Kitchen').click();
		await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Delete room' }).click();
		await expect(page.getByRole('dialog', { name: 'Signed out' })).toBeVisible();
		await expect(page.getByRole('heading', { name: FAILURE_PAGE })).toHaveCount(0);
	});
});

test.describe('E6: error pages', () => {
	test('a missing project and an unknown address show a friendly page with a way back', async ({ page }) => {
		for (const url of ['/p/does-not-exist', '/no/such/page']) {
			await page.goto(url);
			await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
			await expect(page.getByRole('link', { name: 'Mehzur', exact: true })).toBeVisible();
			await expect(page.getByText(/Error id|stack|undefined/)).toHaveCount(0);
			await page.getByRole('link', { name: 'Back to projects' }).click();
			await expect(page).toHaveURL('/');
		}
	});

	test('a missing photo under an existing project offers a way back to the project', async ({ page }) => {
		const projectUrl = await createProject(page, uniqueName('E6 photo'));
		await page.goto(projectUrl + '/photo/does-not-exist');
		await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
		await page.getByRole('link', { name: 'Back to project', exact: true }).click();
		await expect(page).toHaveURL(projectUrl);
	});

	test('a server error while opening a page shows the friendly 500 page', async ({ page }) => {
		// The real server cannot be made to fail on demand, so fail the data request of an in-app navigation:
		// the app then shows its error page exactly as it does for a fault in a page's load.
		const name = uniqueName('E6 fault');
		const projectUrl = await createProject(page, name);
		await page.goto('/');
		// This is the shape of the answer the server gives when a page's load fails and `handleError` has made an id
		// for it (a bare 500 would make the browser fall back to loading the page normally, which then works).
		const fault = { type: 'data', nodes: [{ type: 'skip' }, { type: 'error', error: { status: 500, message: 'Something went wrong on our side.', id: 'abc12345' } }] };
		await page.route('**/__data.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fault) }));
		await page.locator('.projects').getByRole('link', { name: new RegExp(name) }).click();
		await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
		await expect(page.getByText('Something went wrong on our side. Try again in a moment.')).toBeVisible();
		await expect(page.getByText('Error id: abc12345')).toBeVisible();
		await expect(page.getByText(/boom|stack|undefined/)).toHaveCount(0);
		await page.unroute('**/__data.json*');
		await page.getByRole('link', { name: 'Back to projects' }).click();
		await expect(page).toHaveURL('/');
		await page.goto(projectUrl);
		await expect(page.getByRole('button', { name: 'Room', exact: true })).toBeVisible();
	});

	test('API errors stay JSON', async ({ page }) => {
		const res = await page.request.get('/api/photos/does-not-exist');
		expect(res.status()).toBe(404);
		expect(res.headers()['content-type']).toContain('application/json');
		expect(await res.json()).toHaveProperty('message');
	});
});

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";
const SERVER = 'Something went wrong on our side. Try again in a moment.';
const messages = { offline: OFFLINE, server: SERVER } as const;

// `failAction(.., 'offline')` aborts the request, which the app cannot tell apart from a flaky
// connection, so it reports "Couldn't reach the server".
for (const how of ['offline', 'server'] as const) {
	test.describe(`E4: enhanced forms when the request fails (${how})`, () => {
		const noErrorPage = (page: Page) => expect(page.getByRole('heading', { name: FAILURE_PAGE })).toHaveCount(0);
		const alert = (page: Page) => page.getByRole('alert').getByText(messages[how]);

		test('create project keeps the typed name; works again afterwards', async ({ page }) => {
			const name = uniqueName('E4 home');
			await visit(page, '/');
			await failAction(page, 'create', how);
			await page.getByPlaceholder(/New project/).fill(name);
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(alert(page)).toBeVisible();
			await noErrorPage(page);
			await expect(page.getByPlaceholder(/New project/)).toHaveValue(name);
			await page.unroute('**/*?/create');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect(page).toHaveURL(/\/p\//);
		});

		test('add room shows the message inside the popover and keeps the name', async ({ page }) => {
			await createProject(page, uniqueName('E4 add room'));
			await failAction(page, 'createRoom', how);
			await page.getByRole('button', { name: 'Room', exact: true }).click();
			const popover = page.getByRole('dialog', { name: 'Add a room' });
			await popover.getByLabel('Room name').fill('Kitchen');
			await popover.getByRole('button', { name: 'Add room' }).click();
			await expect(popover.getByText(messages[how])).toBeVisible();
			await noErrorPage(page);
			await expect(popover.getByLabel('Room name')).toHaveValue('Kitchen');
			await page.unroute('**/*?/createRoom');
			await popover.getByRole('button', { name: 'Add room' }).click();
			await expect(roomCard(page, 'Kitchen')).toBeVisible();
		});

		test('rename room keeps the field open with the typed name', async ({ page }) => {
			await createProject(page, uniqueName('E4 rename'));
			await addRoom(page, 'Kitchen');
			await failAction(page, 'renameRoom', how);
			await roomMenuButton(page, 'Kitchen').click();
			await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Rename' }).click();
			const card = page.getByRole('article').filter({ has: page.getByLabel('Room name') });
			await card.getByLabel('Room name').fill('Galley');
			await card.getByRole('button', { name: 'Save' }).click();
			await expect(card.getByText(messages[how])).toBeVisible();
			await noErrorPage(page);
			await expect(card.getByLabel('Room name')).toHaveValue('Galley');
			await page.unroute('**/*?/renameRoom');
			await card.getByRole('button', { name: 'Save' }).click();
			await expect(roomCard(page, 'Galley')).toBeVisible();
		});

		test('delete room shows a notification and the room stays', async ({ page }) => {
			await createProject(page, uniqueName('E4 delete room'));
			await addRoom(page, 'Kitchen');
			await failAction(page, 'deleteRoom', how);
			await roomMenuButton(page, 'Kitchen').click();
			await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Delete room' }).click();
			await expect(alert(page)).toBeVisible();
			await noErrorPage(page);
			await expect(roomCard(page, 'Kitchen')).toBeVisible();
			await page.unroute('**/*?/deleteRoom');
			await page.getByRole('button', { name: 'Dismiss' }).click();
			await roomMenuButton(page, 'Kitchen').click();
			await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Delete room' }).click();
			await expect(roomCard(page, 'Kitchen')).toHaveCount(0);
		});

		test('calculate area shows the message inside the menu', async ({ page }) => {
			const { projectUrl } = await seedKitchenWithMeasurements(page);
			await visit(page, projectUrl);
			await failAction(page, 'setRoomArea', how);
			await roomMenuButton(page, 'Kitchen').click();
			const menu = roomMenu(page, 'Kitchen');
			await menu.getByLabel('First measurement (length)').selectOption({ label: `Length · 12'` });
			await menu.getByLabel('Second measurement (width)').selectOption({ label: `Width · 10'` });
			await menu.getByRole('button', { name: 'Calculate' }).click();
			await expect(menu.getByText(messages[how])).toBeVisible();
			await noErrorPage(page);
			await page.unroute('**/*?/setRoomArea');
			await menu.getByRole('button', { name: 'Calculate' }).click();
			await expect(roomCard(page, 'Kitchen').locator('.area')).toHaveText('120.0 ft²');
		});

		test('edit and delete project keep the page', async ({ page }) => {
			const name = uniqueName('E4 project');
			await createProject(page, name);
			await failAction(page, 'update', how);
			await projectMenuItem(page, 'Edit project');
			await page.getByLabel('Name', { exact: true }).fill(name + ' 2');
			await page.getByRole('button', { name: 'Save' }).click();
			await expect(alert(page)).toBeVisible();
			await noErrorPage(page);
			await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name + ' 2');
			await page.unroute('**/*?/update');
			await page.getByRole('button', { name: 'Dismiss' }).click();

			await failAction(page, 'delete', how);
			await page.getByRole('button', { name: 'Delete project' }).click();
			await expect(alert(page)).toBeVisible();
			await noErrorPage(page);
			await page.unroute('**/*?/delete');
			await page.getByRole('button', { name: 'Dismiss' }).click();
			await page.getByRole('button', { name: 'Delete project' }).click();
			await expect(page).toHaveURL('/');
		});

		test('deleting a room that was deleted elsewhere says so and refreshes', async ({ page, context }) => {
			if (how === 'offline') test.skip(true, 'not a connection scenario');
			const projectUrl = await createProject(page, uniqueName('E9 gone'));
			await addRoom(page, 'Kitchen');
			const other = await context.newPage();
			other.on('dialog', (d) => d.accept());
			await visit(other, projectUrl);
			await roomMenuButton(other, 'Kitchen').click();
			await roomMenu(other, 'Kitchen').getByRole('button', { name: 'Delete room' }).click();
			await expect(roomCard(other, 'Kitchen')).toHaveCount(0);
			await roomMenuButton(page, 'Kitchen').click();
			await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Delete room' }).click();
			await expect(page.getByRole('alert').getByText('That item no longer exists. It may have been deleted.')).toBeVisible();
			await expect(roomCard(page, 'Kitchen')).toHaveCount(0);
		});

		test('delete photo from the thumbnail and from the photo menu', async ({ page }) => {
			await createProject(page, uniqueName('E4 photo'));
			await addRoom(page, 'Kitchen');
			await addAndOpenPhoto(page, 'Kitchen');
			const photoUrl = page.url();
			await failAction(page, 'deletePhoto', how);
			await photoMenuButton(page).click();
			await page.getByRole('menuitem', { name: 'Delete photo' }).click();
			await expect(alert(page)).toBeVisible();
			await noErrorPage(page);
			await expect(photoCanvas(page)).toBeVisible();
			await page.getByRole('button', { name: 'Dismiss' }).click();

			await visit(page, photoUrl.replace(/\/photo\/.*/, ''));
			await roomCard(page, 'Kitchen').getByRole('button', { name: 'Delete photo' }).click();
			await expect(alert(page)).toBeVisible();
			await noErrorPage(page);
			await page.unroute('**/*?/deletePhoto');
			await page.getByRole('button', { name: 'Dismiss' }).click();
			await roomCard(page, 'Kitchen').getByRole('button', { name: 'Delete photo' }).click();
			await expect(roomCard(page, 'Kitchen').getByRole('button', { name: 'Delete photo' })).toHaveCount(0);
		});
	});
}

test('E7: the offline banner appears offline, actions say so, and "Back online" follows', async ({ page, context }) => {
	await createProject(page, uniqueName('E7'));
	const banner = page.getByRole('status').filter({ hasText: "You're offline. Changes won't be saved until you reconnect." });
	await expect(banner).toHaveCount(0);

	await goOffline(context);
	await expect(banner).toBeVisible();

	await page.getByRole('button', { name: 'Room', exact: true }).click();
	const popover = page.getByRole('dialog', { name: 'Add a room' });
	await popover.getByLabel('Room name').fill('Kitchen');
	await popover.getByRole('button', { name: 'Add room' }).click();
	await expect(popover.getByText("You're offline. Check your connection and try again.")).toBeVisible();
	await expect(popover.getByRole('button', { name: 'Add room' })).toBeEnabled();

	await goOnline(context);
	await expect(banner).toHaveCount(0);
	await expect(page.getByRole('status').getByText('Back online')).toBeVisible();
	await popover.getByRole('button', { name: 'Add room' }).click();
	await expect(roomCard(page, 'Kitchen')).toBeVisible();
});

test.describe('E8: upload progress and retry', () => {
	const UPLOADS = '**/api/projects/*/photos';
	const list = (page: Page) => page.locator('.uploads');

	test('one failing file of three shows Failed with Retry; retrying uploads it and opens the first photo', async ({ page, browserName }) => {
		// Playwright's WebKit drops the multipart body of an upload it intercepts and lets through
		// (the server then sees an empty file), so this scenario can only be simulated in Chromium.
		test.skip(browserName === 'webkit', 'WebKit request interception loses the upload body');
		const projectUrl = await createProject(page, uniqueName('E8 retry'));
		await addRoom(page, 'Kitchen');
		let count = 0;
		await page.route(UPLOADS, (route) => (++count === 2 ? route.fulfill({ status: 500, body: 'boom' }) : route.continue()));

		await addPhotos(page, 'Kitchen', [await makeImage(page, 640, 480, 'one'), await makeImage(page, 700, 500, 'two'), await makeImage(page, 800, 600, 'three')]);

		const rows = list(page).locator('li');
		await expect(rows.nth(1)).toContainText('Failed: Something went wrong on our side. Try again in a moment.');
		await expect(rows.nth(0)).toContainText('Uploaded');
		await expect(rows.nth(2)).toContainText('Uploaded');
		await expect(page).toHaveURL(projectUrl);
		await expect(rows.nth(1).getByRole('progressbar', { name: /Upload progress for two/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Retry/ })).toHaveCount(1);
		await expect(gridCount(page)).toHaveCount(2);

		await page.unroute(UPLOADS);
		await page.getByRole('button', { name: /^Retry/ }).click();
		await expect(page).toHaveURL(/\/photo\//);
		await waitForPhoto(page);
		expect(await shownPhotoWidth(page)).toBe('640');
	});

	test('when every file fails, each one can be retried on its own (also runs in WebKit)', async ({ page }) => {
		// Only failing requests are intercepted: Playwright's WebKit loses the body of an upload it lets through.
		const projectUrl = await createProject(page, uniqueName('E8 all fail'));
		await addRoom(page, 'Kitchen');
		await page.route(UPLOADS, (route) => route.fulfill({ status: 500, body: 'boom' }));
		await addPhotos(page, 'Kitchen', [await makeImage(page, 640, 480, 'one'), await makeImage(page, 700, 500, 'two'), await makeImage(page, 800, 600, 'three')]);

		const rows = list(page).locator('li');
		for (const i of [0, 1, 2]) await expect(rows.nth(i)).toContainText('Failed: Something went wrong on our side.');
		await expect(page.getByRole('button', { name: /^Retry/ })).toHaveCount(3);
		await expect(page).toHaveURL(projectUrl);

		await page.unroute(UPLOADS);
		await page.getByRole('button', { name: /^Retry one/ }).click();
		await expect(rows.nth(0)).toContainText('Uploaded');
		await expect(rows.nth(1)).toContainText('Failed');
		await expect(page.getByRole('button', { name: /^Retry/ })).toHaveCount(2);
		await expect(gridCount(page)).toHaveCount(1);
	});

	test('offline uploads say so for each file, and can be dismissed', async ({ page, context }) => {
		const projectUrl = await createProject(page, uniqueName('E8 offline'));
		await goOffline(context);
		await addPhotos(page, 'No room', [await makeImage(page, 640, 480, 'a'), await makeImage(page, 700, 500, 'b')]);
		const rows = list(page).locator('li');
		await expect(rows).toHaveCount(2);
		for (const i of [0, 1]) await expect(rows.nth(i)).toContainText("Failed: You're offline. Check your connection and try again.");
		await page.getByRole('button', { name: 'Dismiss upload list' }).click();
		await expect(list(page)).toHaveCount(0);
		await goOnline(context);
		await expect(page).toHaveURL(projectUrl);
	});

	test("a refusal from the server shows the server's message and no Retry", async ({ page }) => {
		await createProject(page, uniqueName('E8 refused'));
		await page.route(UPLOADS, (route) =>
			route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ message: 'Image must be under 15 MB' }) })
		);
		await addPhotos(page, 'No room', await makeImage(page, 640, 480));
		await expect(list(page)).toContainText('Failed: Image must be under 15 MB');
		await expect(page.getByRole('button', { name: /^Retry/ })).toHaveCount(0);
	});

	test('an expired session stops the batch, keeps the files listed as Not uploaded and asks to sign in', async ({ page, context }) => {
		await createProject(page, uniqueName('E8 session'));
		await expireSession(context);
		await addPhotos(page, 'No room', [await makeImage(page, 640, 480, 'a'), await makeImage(page, 700, 500, 'b')]);
		await expect(page.getByRole('dialog', { name: 'Signed out' })).toBeVisible();
		await expect(list(page).locator('li', { hasText: 'Not uploaded' })).toHaveCount(2);
		await expect(page.getByRole('button', { name: /^Retry/ })).toHaveCount(2);
	});
});
