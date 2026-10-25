import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ APP_PASSWORD: 'open-sesame', SESSION_SECRET: 'unit-test-secret' }));

const { handleError } = await import('../hooks.server.ts');

const event = {
	request: new Request('http://localhost/p/1?x=1', {
		method: 'POST',
		headers: { cookie: 'rooms_session=SECRET-COOKIE' },
		body: 'password=hunter2'
	}),
	url: new URL('http://localhost/p/1?x=1'),
	route: { id: '/p/[id]' }
};
const call = (input: unknown) => (handleError as unknown as (i: unknown) => unknown)(input);

afterEach(() => vi.restoreAllMocks());

describe('handleError', () => {
	it('gives unexpected errors a generic message and an id, and logs one JSON line', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = call({ kind: 'unknown', error: new Error('db exploded'), event }) as { message: string; id: string };
		expect(result.message).toBe('Something went wrong on our side.');
		expect(result.id).toMatch(/^[0-9a-f]{8}$/);
		expect(spy).toHaveBeenCalledTimes(1);
		const line = JSON.parse(spy.mock.calls[0][0] as string);
		expect(line).toMatchObject({ id: result.id, status: 500, method: 'POST', path: '/p/1', route: '/p/[id]', message: 'db exploded' });
		expect(line.stack).toContain('db exploded');
	});

	it('logs no cookie, password or query string', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		call({ kind: 'unknown', error: new Error('x'), event });
		const text = spy.mock.calls[0][0] as string;
		expect(text).not.toMatch(/SECRET-COOKIE|hunter2|open-sesame|x=1/);
	});

	it('treats 5xx app errors as unexpected', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = call({ kind: 'app', error: { status: 503, message: 'down' }, event }) as { id: string };
		expect(result.id).toBeTruthy();
	});

	it('passes expected errors through without logging', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(call({ kind: 'app', error: { status: 404, message: 'Project not found' }, event })).toBeUndefined();
		expect(call({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event })).toBeUndefined();
		expect(spy).not.toHaveBeenCalled();
	});

	it('never throws, whatever it is given', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const input of [{}, { kind: 'unknown' }, { kind: 'unknown', error: null, event: null }, { kind: 'unknown', error: 'text', event: {} }, null]) {
			expect(() => call(input)).not.toThrow();
		}
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(() => call({ kind: 'unknown', error: cyclic, event })).not.toThrow();
	});
});
