import { expect, test } from './fixtures';
import {
	addAndOpenPhoto,
	addRoom,
	createProject,
	expectFitsViewport,
	reload,
	roomCard,
	roomMenu,
	roomMenuButton,
	uniqueName,
	visit
} from './helpers';

test('a new project starts with only the No room card and no hint text', async ({ page }) => {
	await createProject(page, uniqueName('Fresh'));
	await expect(roomCard(page, 'No room')).toBeVisible();
	await expect(roomCard(page, 'No room').getByLabel('Add photos to No room')).toBeAttached();
	await expect(page.getByRole('article')).toHaveCount(1);
	expect(await page.locator('main').innerText()).not.toContain('No Room');

	const text = await page.locator('main').innerText();
	for (const gone of ['Area not set', 'No photos', 'Add two measurements', 'tap two points', 'No measurements yet']) {
		expect(text).not.toContain(gone);
	}
	await expect(page.getByRole('heading', { name: 'Measurements' })).toHaveCount(0); // hidden until there is one
});

test('adding a room with the "+ Room" dialog', async ({ page }) => {
	await createProject(page, uniqueName('Rooms'));
	const addButton = page.getByRole('button', { name: 'Room', exact: true });
	const popover = page.getByRole('dialog', { name: 'Add a room' });
	await expect(popover).toBeHidden();

	await addButton.click();
	await expect(popover).toBeVisible();
	await expect(popover.getByLabel('Room name')).toBeFocused();
	await expectFitsViewport(page, popover);

	// a blank name is refused inside the dialog, which stays open
	await popover.getByLabel('Room name').fill('   ');
	await popover.getByRole('button', { name: 'Add room' }).click();
	await expect(popover.getByText(/Enter a room name/)).toBeVisible();
	await expect(popover).toBeVisible();

	// Enter submits; the dialog closes and is empty next time
	await popover.getByLabel('Room name').fill('Kitchen');
	await page.keyboard.press('Enter');
	await expect(roomCard(page, 'Kitchen')).toBeVisible();
	await expect(popover).toBeHidden();
	await addButton.click();
	await expect(popover.getByLabel('Room name')).toHaveValue('');
	await expect(popover.getByText(/Enter a room name/)).toHaveCount(0);

	// Escape and Cancel both close it
	await page.keyboard.press('Escape');
	await expect(popover).toBeHidden();
	await expect(addButton).toBeFocused();
	await addButton.click();
	await popover.getByRole('button', { name: 'Cancel' }).click();
	await expect(popover).toBeHidden();
	await expect(addButton).toBeFocused();
	await expect(page.getByRole('article')).toHaveCount(2); // Kitchen + No room
});

test('rename and delete a room from its menu', async ({ page, confirmations }) => {
	await createProject(page, uniqueName('Menu'));
	await addRoom(page, 'Kitchen');
	await addRoom(page, 'Bedroom');

	// the menu holds Rename and Delete room; nothing else is visible until it opens
	await expect(roomMenu(page, 'Kitchen')).toBeHidden();
	await roomMenuButton(page, 'Kitchen').click();
	await expect(roomMenu(page, 'Kitchen').getByRole('button', { name: 'Rename' })).toBeVisible();
	await expect(roomMenu(page, 'Kitchen').getByRole('button', { name: 'Delete room' })).toBeVisible();

	// only one menu at a time
	await roomMenuButton(page, 'Bedroom').click();
	await expect(roomMenu(page, 'Kitchen')).toBeHidden();
	await expect(roomMenu(page, 'Bedroom')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(roomMenu(page, 'Bedroom')).toBeHidden();
	await expect(roomMenuButton(page, 'Bedroom')).toBeFocused();

	// rename, including cancelling
	await roomMenuButton(page, 'Kitchen').click();
	await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Rename' }).click();
	const rename = page.getByRole('dialog', { name: 'Rename room' });
	await expect(rename.getByLabel('Room name')).toHaveValue('Kitchen');
	await rename.getByLabel('Room name').fill('Galley');
	await rename.getByRole('button', { name: 'Cancel' }).click();
	await expect(rename).toBeHidden();
	await expect(roomCard(page, 'Kitchen')).toBeVisible();
	await roomMenuButton(page, 'Kitchen').click();
	await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Rename' }).click();
	await expect(rename.getByLabel('Room name')).toHaveValue('Kitchen');
	await rename.getByLabel('Room name').fill('Galley');
	await rename.getByRole('button', { name: 'Save' }).click();
	await expect(rename).toBeHidden();
	await expect(roomCard(page, 'Galley')).toBeVisible();
	await expect(roomCard(page, 'Kitchen')).toHaveCount(0);

	// delete: declined, then accepted, and it stays deleted
	confirmations.answer = false;
	await roomMenuButton(page, 'Bedroom').click();
	await roomMenu(page, 'Bedroom').getByRole('button', { name: 'Delete room' }).click();
	await expect(roomCard(page, 'Bedroom')).toBeVisible();
	confirmations.answer = true;
	await roomMenuButton(page, 'Bedroom').click();
	await roomMenu(page, 'Bedroom').getByRole('button', { name: 'Delete room' }).click();
	await expect(roomCard(page, 'Bedroom')).toHaveCount(0);
	await reload(page);
	await expect(roomCard(page, 'Bedroom')).toHaveCount(0);
	await expect(roomCard(page, 'Galley')).toBeVisible();
});

test('rooms collapse and expand, and the choice is remembered', async ({ page }) => {
	await createProject(page, uniqueName('Collapse'));
	await addRoom(page, 'Kitchen');
	await addRoom(page, 'Bedroom');
	const toggle = (room: string) => roomCard(page, room).getByRole('button', { name: room, exact: true });

	await expect(toggle('Kitchen')).toHaveAttribute('aria-expanded', 'true');
	await toggle('Kitchen').click();
	await expect(toggle('Kitchen')).toHaveAttribute('aria-expanded', 'false');
	await expect(roomCard(page, 'Kitchen').locator('.summary')).toHaveText('0 photos · 0 measurements');
	await expect(roomCard(page, 'Kitchen').locator('.add-photo')).toHaveCount(0); // body hidden
	await expect(roomMenuButton(page, 'Kitchen')).toBeVisible(); // but its menu is still there
	await expect(toggle('Bedroom')).toHaveAttribute('aria-expanded', 'true'); // others untouched

	await toggle('No room').click();
	await expect(roomCard(page, 'No room').locator('.summary')).toHaveText('0 photos');

	await reload(page);
	await expect(toggle('Kitchen')).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle('No room')).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle('Bedroom')).toHaveAttribute('aria-expanded', 'true');

	await toggle('Kitchen').click();
	await expect(roomCard(page, 'Kitchen').locator('.add-photo')).toHaveCount(1);
});

test('collapse state is kept per project', async ({ page }) => {
	await createProject(page, uniqueName('One'));
	await addRoom(page, 'Kitchen');
	await roomCard(page, 'Kitchen').getByRole('button', { name: 'Kitchen', exact: true }).click();
	await createProject(page, uniqueName('Two'));
	await addRoom(page, 'Kitchen');
	await expect(roomCard(page, 'Kitchen').getByRole('button', { name: 'Kitchen', exact: true })).toHaveAttribute('aria-expanded', 'true');
});

test('deleting a room moves its photos to No room', async ({ page }) => {
	const projectUrl = await createProject(page, uniqueName('Move'));
	await addRoom(page, 'Kitchen');
	await addAndOpenPhoto(page, 'Kitchen');
	await visit(page, projectUrl);
	await expect(roomCard(page, 'Kitchen').locator('.grid li:not(.add-photo)')).toHaveCount(1);

	await roomMenuButton(page, 'Kitchen').click();
	await roomMenu(page, 'Kitchen').getByRole('button', { name: 'Delete room' }).click();
	await expect(roomCard(page, 'Kitchen')).toHaveCount(0);
	await expect(roomCard(page, 'No room').locator('.grid li:not(.add-photo)')).toHaveCount(1);
});

test('a double click on Add room makes one room', async ({ page }) => {
	await createProject(page, uniqueName('Twice'));
	await page.getByRole('button', { name: 'Room', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Add a room' });
	await dialog.getByLabel('Room name').fill('Kitchen');
	await dialog.getByRole('button', { name: 'Add room' }).dblclick();
	await expect(roomCard(page, 'Kitchen')).toBeVisible();
	await expect(dialog).toBeHidden();
	await expect(roomCard(page, 'Kitchen')).toHaveCount(1);
});
