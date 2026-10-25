import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ APP_PASSWORD: 'open-sesame', SESSION_SECRET: 'unit-test-secret' }));

const { handle } = await import('../hooks.server.ts');

function signedOut(url: string, init: RequestInit = {}) {
	const resolve = vi.fn(async () => new Response('page'));
	const event = {
		url: new URL(url),
		request: new Request(url, init),
		cookies: { get: () => undefined },
		locals: {} as Record<string, unknown>
	};
	const run = () => (handle as unknown as (i: unknown) => Promise<Response>)({ event, resolve });
	return { run, resolve };
}

describe('signed-out requests', () => {
	it('answer a scripted action call with a 401 action result, not a redirect', async () => {
		const { run, resolve } = signedOut('http://localhost/p/1?/createRoom', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' }
		});
		const res = await run();
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ type: 'error', status: 401 });
		expect(resolve).not.toHaveBeenCalled();
	});

	it('still redirect a plain form post to sign-in, returning to the page and not the action address', async () => {
		const { run } = signedOut('http://localhost/p/1?/createRoom', { method: 'POST' });
		await expect(run()).rejects.toMatchObject({ status: 303, location: '/login?next=%2Fp%2F1' });
	});

	it('keep the query string of an ordinary page in `next`', async () => {
		const { run } = signedOut('http://localhost/p/1/photo/2?select=abc');
		await expect(run()).rejects.toMatchObject({
			status: 303,
			location: `/login?next=${encodeURIComponent('/p/1/photo/2?select=abc')}`
		});
	});
});
