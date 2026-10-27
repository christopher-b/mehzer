import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError } from './hooks.client.ts';

const call = (error: unknown, kind: 'unknown' | 'expected' = 'unknown') =>
	(handleError as unknown as (input: unknown) => unknown)({ error, kind, event: {}, status: 500, message: '' });

beforeEach(() => vi.stubGlobal('navigator', { onLine: true }));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('hooks.client handleError', () => {
	it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
		'tags a failed fetch (%s) as a network error',
		(message) => {
			expect(call(new TypeError(message))).toEqual({ status: 503, message: 'Network error', code: 'network' });
		}
	);

	it('tags any TypeError as a network error while the browser is offline', () => {
		vi.stubGlobal('navigator', { onLine: false });
		expect(call(new TypeError('x is undefined'))).toMatchObject({ code: 'network' });
	});

	it('logs a plain TypeError with an id instead of calling it a network error', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = call(new TypeError('x is undefined')) as { message: string; id: string; code?: string };
		expect(result.code).toBeUndefined();
		expect(result.message).toBe('Something went wrong on our side.');
		expect(result.id).toMatch(/^[0-9a-f]{8}$/);
		expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ id: result.id, message: 'x is undefined' });
	});

	it('leaves expected errors (404 and the like) to SvelteKit', () => {
		expect(call(new Error('Not found'), 'expected')).toBeUndefined();
	});
});
