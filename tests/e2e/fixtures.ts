import { test as base, expect } from '@playwright/test';

/**
 * `confirmations.answer` controls what the browser's confirm() boxes (delete photo, room,
 * project...) get: true (OK, the default) or false (Cancel).
 */
export const test = base.extend<{ confirmations: { answer: boolean } }>({
	confirmations: async ({}, use) => {
		await use({ answer: true });
	},
	page: async ({ page, confirmations }, use) => {
		page.on('dialog', (dialog) => (confirmations.answer ? dialog.accept() : dialog.dismiss()));
		await use(page);
	}
});

export { expect };
