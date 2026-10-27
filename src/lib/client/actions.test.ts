import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateAll = vi.fn();
vi.mock('$app/navigation', () => ({ invalidateAll: () => invalidateAll(), goto: vi.fn() }));
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));

import { failureMessage, postAction } from './actions.ts';

const respond = (body: unknown, status = 200) =>
	vi.fn(async (_url: string, _init?: unknown) => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
	invalidateAll.mockReset();
	vi.unstubAllGlobals();
});

describe('postAction', () => {
	it('posts to the current page, or to the page it is given', async () => {
		const fetch = respond({ type: 'success', status: 200 });
		vi.stubGlobal('fetch', fetch);
		invalidateAll.mockResolvedValue(undefined);
		await postAction('move', { id: 'a' });
		await postAction('move', { id: 'a' }, { path: '/p/1/photo/2' });
		expect(fetch.mock.calls.map((c) => c[0])).toEqual(['?/move', '/p/1/photo/2?/move']);
	});

	it('still succeeds, with the action data, when refreshing the page data fails', async () => {
		vi.stubGlobal('fetch', respond({ type: 'success', status: 200, data: { id: 'new' } }));
		invalidateAll.mockRejectedValue(new Error('offline right after saving'));
		const result = await postAction('create', {});
		expect(invalidateAll).toHaveBeenCalled();
		expect(result).toEqual({ id: 'new' });
	});
});

describe('failureMessage', () => {
	it('uses the form\'s message only when it is text', () => {
		expect(failureMessage({ data: { error: 'Pick two' } }, 'Nope')).toBe('Pick two');
		expect(failureMessage({ data: { error: { nested: true } } }, 'Nope')).toBe('Nope');
		expect(failureMessage({}, 'Nope')).toBe('Nope');
	});
});
