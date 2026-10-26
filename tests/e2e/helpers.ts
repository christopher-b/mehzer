import type { BrowserContext, Locator, Page } from '@playwright/test';
import { ADMIN } from './constants';
import { expect, test } from './fixtures';

export const isTouch = () => !!test.info().project.use.hasTouch;

/**
 * SvelteKit sends HTML first and attaches click handlers a moment later; the app sets
 * `data-hydrated` on <html> when that is done. Clicking before then loses the click.
 */
export const waitForHydration = (page: Page) => page.locator('html[data-hydrated]').waitFor({ state: 'attached' });

/** `page.goto`, then wait until the page is interactive. */
export async function visit(page: Page, url: string) {
	await page.goto(url);
	await waitForHydration(page);
}

/** `page.reload`, then wait until the page is interactive. */
export async function reload(page: Page) {
	await page.reload();
	await waitForHydration(page);
}

/** A project name that is unique per call, so tests never collide in the shared database. */
export function uniqueName(label: string) {
	return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------- projects and rooms

/** On the home page: open the "+ Project" popover. */
export function addProjectPopover(page: Page) {
	return page.getByRole('dialog', { name: 'Add a project' });
}

export async function openAddProject(page: Page) {
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	const popover = addProjectPopover(page);
	await expect(popover).toBeVisible();
	return popover;
}

export async function createProject(page: Page, name: string, units: 'imperial' | 'metric' = 'imperial') {
	await visit(page, '/');
	const popover = await openAddProject(page);
	await popover.getByLabel('Project name').fill(name);
	await popover.getByLabel('Units').selectOption(units);
	await popover.getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/p\/[0-9a-f-]+$/);
	await waitForHydration(page);
	return page.url();
}

/** Open the project's menu and choose an item. */
export async function projectMenuItem(page: Page, name: 'Edit project' | 'Export CSV' | 'Export PDF') {
	await page.getByRole('button', { name: 'Project menu' }).click();
	await page.getByRole('menuitem', { name }).click();
}

export async function deleteCurrentProject(page: Page) {
	await projectMenuItem(page, 'Edit project');
	await page.getByRole('button', { name: 'Delete project' }).click();
	await expect(page).toHaveURL('/');
}

/** A room card (or the "No room" card) on the project page, found by its name. */
export function roomCard(page: Page, name: string): Locator {
	return page.getByRole('article', { name, exact: true });
}

export const roomMenuButton = (page: Page, room: string) => roomCard(page, room).getByRole('button', { name: `Menu for ${room}` });
export const roomMenu = (page: Page, room: string) => roomCard(page, room).locator('.menu');

export async function addRoom(page: Page, name: string) {
	await page.getByRole('button', { name: 'Room', exact: true }).click();
	const popover = page.getByRole('dialog', { name: 'Add a room' });
	await popover.getByLabel('Room name').fill(name);
	await popover.getByRole('button', { name: 'Add room' }).click();
	await expect(roomCard(page, name)).toBeVisible();
	await expect(popover).toBeHidden();
}

// ---------------------------------------------------------------- photos

export interface TestImage {
	name: string;
	mimeType: string;
	buffer: Buffer;
}

/** Makes a real JPEG of the given size in the browser, so the suite needs no binary fixtures. */
export async function makeImage(page: Page, width: number, height: number, label = ''): Promise<TestImage> {
	const text = label || `${width}x${height}`;
	const base64 = await page.evaluate(
		async ({ width, height, text }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d')!;
			const gradient = ctx.createLinearGradient(0, 0, width, height);
			gradient.addColorStop(0, '#cfd8dc');
			gradient.addColorStop(1, '#78909c');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			ctx.fillStyle = '#263238';
			ctx.font = `${Math.round(height / 8)}px sans-serif`;
			ctx.fillText(text, width / 20, height / 2);
			const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
			const bytes = new Uint8Array(await blob!.arrayBuffer());
			let binary = '';
			for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return btoa(binary);
		},
		{ width, height, text }
	);
	return { name: `${text}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') };
}

/** Add photos to a room (or "No room") with its "+" tile. Does not wait for any navigation. */
export async function addPhotos(page: Page, room: string, images: TestImage | TestImage[]) {
	await roomCard(page, room).getByLabel(`Add photos to ${room}`).setInputFiles(images);
}

export const photoCanvas = (page: Page) => page.getByRole('application', { name: 'Photo annotations' });

export async function waitForPhoto(page: Page) {
	await expect(photoCanvas(page)).toBeVisible();
	await page.waitForFunction(() => (document.querySelector('.canvas img') as HTMLImageElement | null)?.complete);
}

/** Width of the photo currently shown, from its <img width> attribute (identifies which photo it is). */
export const shownPhotoWidth = (page: Page) => page.locator('.canvas img').getAttribute('width');

/** Add one photo to a room and open it. Returns the photo page URL. */
export async function addAndOpenPhoto(page: Page, room: string, width = 640, height = 480) {
	await addPhotos(page, room, await makeImage(page, width, height));
	await expect(page).toHaveURL(/\/photo\//);
	await waitForPhoto(page);
	return page.url();
}

// ---------------------------------------------------------------- measuring

/** Click (mouse) or tap (touch) at a fractional position over the photo. */
export async function tapAt(page: Page, fx: number, fy: number) {
	const box = (await photoCanvas(page).boundingBox())!;
	const x = box.x + box.width * fx;
	const y = box.y + box.height * fy;
	if (isTouch()) await page.touchscreen.tap(x, y);
	else await page.mouse.click(x, y);
}

export const measurementDialog = (page: Page) => page.getByRole('dialog', { name: /measurement/ });
export const measurementField = (page: Page) => measurementDialog(page).getByLabel(/^Measurement/);

/** Tap two points to start a measurement and wait for its dialog. */
export async function startMeasurement(page: Page, y = 0.3, fromX = 0.2, toX = 0.7) {
	await tapAt(page, fromX, y);
	await tapAt(page, toX, y);
	await expect(measurementDialog(page)).toBeVisible();
}

/** Draw a measurement and save it. The new measurement stays selected afterwards. */
export async function drawMeasurement(page: Page, value: string, opts: { name?: string; y?: number } = {}) {
	await startMeasurement(page, opts.y);
	await measurementField(page).fill(value);
	if (opts.name) await measurementDialog(page).getByLabel(/^Name/).fill(opts.name);
	await measurementDialog(page).getByRole('button', { name: 'Save' }).click();
	await expect(measurementDialog(page)).toBeHidden();
}

/** The first tap on empty photo only deselects a selected measurement. */
export async function deselect(page: Page) {
	await tapAt(page, 0.5, 0.97);
	await expect(page.locator('.annotation.selected')).toHaveCount(0);
}

/** Drag one end of the selected measurement to a fractional position (mouse, or touch events on phones). */
export async function dragHandle(page: Page, handle: 0 | 1, toX: number, toY: number) {
	const box = (await photoCanvas(page).boundingBox())!;
	const h = (await page.locator('.handle').nth(handle).boundingBox())!;
	const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
	const to = { x: box.x + box.width * toX, y: box.y + box.height * toY };
	const chromium = page.context().browser()?.browserType().name() === 'chromium';
	// Real touch events can only be injected in Chromium (via the DevTools protocol). Elsewhere the
	// mouse drives the same pointer-event handlers, but "does the page scroll instead of dragging?"
	// can only be checked on a real phone (see docs/phone-test-checklist.md).
	if (isTouch() && chromium) {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
		for (let i = 1; i <= 5; i++) {
			const p = { x: from.x + ((to.x - from.x) * i) / 5, y: from.y + ((to.y - from.y) * i) / 5 };
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
		}
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	} else {
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 5 });
		await page.mouse.up();
	}
}

// ---------------------------------------------------------------- simulated failures

/**
 * Make one form action fail for this page: `offline` (the request never gets an answer) or `server`
 * (a 500 with a body that is not an action result). "Not found" is not simulated here: delete the
 * item from a second page of the same context instead. Undo with `page.unroute('**\/*?/' + action)`.
 */
export async function failAction(page: Page, action: string, how: 'offline' | 'server') {
	await page.route('**/*?/' + action, (route) =>
		how === 'offline' ? route.abort('internetdisconnected') : route.fulfill({ status: 500, body: 'boom' })
	);
}

export const goOffline = (context: BrowserContext) => context.setOffline(true);
export const goOnline = (context: BrowserContext) => context.setOffline(false);

/** Fill in the sign-in form (on /login) as the test administrator and submit it. */
export async function signIn(page: Page, who: { email: string; password: string } = ADMIN) {
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Choose "Sign out" from the account menu in the header. */
export async function signOut(page: Page) {
	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

/** Sign out without telling the page: the next request is made with no session. */
export const expireSession = (context: BrowserContext) => context.clearCookies();

/** Sign back in by restoring cookies saved earlier with `context.storageState()`. */
export const restoreSession = (context: BrowserContext, state: Awaited<ReturnType<BrowserContext['storageState']>>) =>
	context.addCookies(state.cookies);

/**
 * Start recording every piece of message text the app shows (alerts, status lines, inline errors, upload
 * rows). Call before the page loads; `expectNoTechnicalText` then checks what was shown.
 */
export async function recordShownMessages(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { __shown: Set<string> };
		w.__shown = new Set();
		const scan = () => {
			for (const el of document.querySelectorAll('[role=alert], [role=status], .error, .uploads .status, .offline')) {
				const text = el.textContent?.trim();
				if (text) w.__shown.add(text);
			}
		};
		new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
	});
}

/** No message shown to the user mentions fetch, JSON, tokens, undefined/null, status codes or stack traces. */
export async function expectNoTechnicalText(page: Page) {
	const shown = await page.evaluate(() => [...((window as unknown as { __shown?: Set<string> }).__shown ?? [])]);
	const technical = /\b(fetch|json|token|undefined|null|NaN|stack)\b|TypeError|SyntaxError|Error:|\bat \S+:\d+|\b[45]\d\d\b/i;
	expect(
		shown.filter((text) => technical.test(text)),
		'messages with technical wording'
	).toEqual([]);
}

// ---------------------------------------------------------------- layout and readability

/** Visible controls whose text has less than 4.5:1 contrast against their background. */
export async function lowContrastControls(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const parse = (c: string) => {
			const m = c.match(/[\d.]+/g)!.map(Number);
			return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
		};
		type Color = ReturnType<typeof parse>;
		const luminance = ({ r, g, b }: Color) => {
			const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const over = (top: Color, bottom: Color): Color => ({
			r: top.r * top.a + bottom.r * (1 - top.a),
			g: top.g * top.a + bottom.g * (1 - top.a),
			b: top.b * top.a + bottom.b * (1 - top.a),
			a: 1
		});
		const backgroundOf = (el: Element) => {
			const layers: Color[] = [];
			for (let e: Element | null = el; e; e = e.parentElement) {
				const c = parse(getComputedStyle(e).backgroundColor);
				if (c.a > 0) layers.push(c);
				if (c.a === 1) break;
			}
			let acc: Color = { r: 255, g: 255, b: 255, a: 1 };
			for (const layer of layers.reverse()) acc = over(layer, acc);
			return acc;
		};
		const bad: string[] = [];
		const controls = document.querySelectorAll<HTMLElement>(
			'button, select, input:not([type=hidden]):not([type=file]), a.back, a.nav-button'
		);
		for (const el of controls) {
			if (!el.getClientRects().length || (el as HTMLButtonElement).disabled) continue;
			const bg = backgroundOf(el);
			const l1 = luminance(over(parse(getComputedStyle(el).color), bg));
			const l2 = luminance(bg);
			const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
			if (ratio < 4.5) {
				const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24);
				bad.push(`${el.tagName.toLowerCase()} "${label}" ${ratio.toFixed(2)}:1`);
			}
		}
		return bad;
	});
}

export async function expectReadable(page: Page) {
	expect(await lowContrastControls(page), 'controls with poor text contrast').toEqual([]);
}

/** The element is fully inside the viewport horizontally. */
export async function expectFitsViewport(page: Page, locator: Locator) {
	const box = (await locator.boundingBox())!;
	const width = page.viewportSize()!.width;
	expect(box.x, 'left edge on screen').toBeGreaterThanOrEqual(0);
	expect(box.x + box.width, 'right edge on screen').toBeLessThanOrEqual(width + 0.5);
}

export async function expectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
	expect(overflow, 'page scrolls sideways').toBe(false);
}

// ---------------------------------------------------------------- ready-made scenarios

/**
 * A project with a Kitchen holding one photo and two measurements named Length and Width
 * (12' and 10' in an imperial project, 3.5 m and 3 m in a metric one). Leaves you on the photo page.
 */
export async function seedKitchenWithMeasurements(page: Page, units: 'imperial' | 'metric' = 'imperial') {
	const project = uniqueName('Seed');
	const projectUrl = await createProject(page, project, units);
	await addRoom(page, 'Kitchen');
	const photoUrl = await addAndOpenPhoto(page, 'Kitchen');
	await drawMeasurement(page, units === 'imperial' ? `12'` : '3.5', { name: 'Length', y: 0.3 });
	await deselect(page);
	await drawMeasurement(page, units === 'imperial' ? `10'` : '3', { name: 'Width', y: 0.5 });
	return { project, projectUrl, photoUrl };
}

export const photoMenuButton = (page: Page) => page.getByRole('button', { name: 'Photo menu' });

/** Visible interactive controls with no accessible name (no label, text, aria-label or title). */
export async function unlabeledControls(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const bad: string[] = [];
		for (const el of document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]), select, textarea')) {
			if (!el.getClientRects().length) continue;
			const labelled = (el as HTMLInputElement).labels?.length ? [...(el as HTMLInputElement).labels!].some((l) => l.textContent?.trim()) : false;
			const named =
				labelled ||
				!!el.getAttribute('aria-label')?.trim() ||
				!!el.getAttribute('aria-labelledby') ||
				!!el.getAttribute('title')?.trim() ||
				!!el.querySelector('img[alt]:not([alt=""])') || // e.g. a thumbnail link

				(!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && !!el.textContent?.trim());
			if (!named) bad.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}${(el as HTMLInputElement).name ? `[name=${(el as HTMLInputElement).name}]` : ''}`);
		}
		return bad;
	});
}

export async function expectAllControlsNamed(page: Page) {
	expect(await unlabeledControls(page), 'controls with no accessible name').toEqual([]);
}
