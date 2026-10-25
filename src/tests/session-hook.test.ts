import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ APP_PASSWORD: 'open-sesame', SESSION_SECRET: 'unit-test-secret' }));

vi.mock('#lib/server/platform.ts', async () => {
	const { createTestDb, createMemoryStorage } = await import('./helpers.ts');
	const services = { db: createTestDb(), storage: createMemoryStorage().storage };
	return { getServices: async () => services };
});

const { handle } = await import('../hooks.server.ts');

function signedOut(url: string, init: RequestInit = {}, token?: string) {
	const resolve = vi.fn(async () => new Response('page'));
	const event = {
		url: new URL(url),
		request: new Request(url, init),
		cookies: { get: () => token },
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

describe('public pages need no session', () => {
	it.each(['/login', '/setup', '/forgot', '/invite/some-token', '/reset/some-token', '/manifest.webmanifest'])('%s', async (path) => {
		const { run, resolve } = signedOut(`http://localhost${path}`);
		await run();
		expect(resolve).toHaveBeenCalledTimes(1);
	});

	it('but not the account, admin or API addresses', async () => {
		for (const path of ['/account', '/admin/users', '/p/1', '/invites']) {
			await expect(signedOut(`http://localhost${path}`).run()).rejects.toMatchObject({ status: 303 });
		}
		await expect(signedOut('http://localhost/api/health').run()).rejects.toMatchObject({ status: 401 });
	});
});

describe('signed-in requests', () => {
	const sessionFor = async (userId: string) => {
		const { createSession } = await import('#lib/server/sessions.ts');
		const { getServices } = await import('#lib/server/platform.ts');
		const { db } = await getServices();
		return { db, token: await createSession(db, 'unit-test-secret', userId, null) };
	};

	it('put the user on locals and carry on', async () => {
		const { token } = await sessionFor('user-test-1');
		const { run, resolve } = signedOut('http://localhost/p/1', {}, token);
		await run();
		expect(resolve).toHaveBeenCalledTimes(1);
		const event = (resolve.mock.calls[0] as unknown as [{ locals: { user: { id: string } | null; sessionId: string } }])[0];
		expect(event.locals.user?.id).toBe('user-test-1');
		expect(event.locals.sessionId).toBeTruthy();
	});

	it('are treated as signed out when the user has been disabled', async () => {
		const { db, token } = await sessionFor('user-test-1');
		const { users } = await import('#lib/server/db/schema.ts');
		const { eq } = await import('drizzle-orm');
		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, 'user-test-1'));
		try {
			await expect(signedOut('http://localhost/p/1', {}, token).run()).rejects.toMatchObject({ status: 303 });
		} finally {
			await db.update(users).set({ disabledAt: null }).where(eq(users.id, 'user-test-1'));
		}
	});

	it('are signed out by an unknown or forged cookie', async () => {
		await expect(signedOut('http://localhost/p/1', {}, 'forged-token').run()).rejects.toMatchObject({ status: 303 });
	});
});
