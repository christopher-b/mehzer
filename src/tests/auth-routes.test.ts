import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ APP_PASSWORD: 'open-sesame', SESSION_SECRET: 'unit-test-secret' }));

const { actions, load } = await import('../routes/login/+page.server.ts');
const { POST: logout } = await import('../routes/logout/+server.ts');
const { GET: servePhoto } = await import('../routes/api/photos/[...key]/+server.ts');
const { SESSION_COOKIE, verifySessionToken } = await import('#lib/server/auth.ts');
const { createContext } = await import('./helpers.ts');

function cookieJar() {
	return { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
}

const login = (password: string, next?: string, origin = 'http://localhost') => {
	const cookies = cookieJar();
	const body = new FormData();
	body.set('password', password);
	const url = new URL(`${origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
	const result = (actions.default as never as (e: unknown) => Promise<unknown>)({
		request: new Request(url, { method: 'POST', body }),
		cookies,
		url
	});
	return { cookies, result };
};

describe('login action', () => {
	it('sets a valid session cookie and redirects home on the right password', async () => {
		const { cookies, result } = login('open-sesame');
		await expect(result).rejects.toMatchObject({ status: 303, location: '/' });
		expect(cookies.set).toHaveBeenCalledTimes(1);
		const [name, token, options] = cookies.set.mock.calls[0];
		expect(name).toBe(SESSION_COOKIE);
		expect(await verifySessionToken('unit-test-secret', token)).toBe(true);
		expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
	});

	it('marks the cookie Secure only when served over https (so plain-http LAN use works)', async () => {
		const http = login('open-sesame', undefined, 'http://192.168.1.20:3000');
		await expect(http.result).rejects.toBeDefined();
		expect(http.cookies.set.mock.calls[0][2]).toMatchObject({ secure: false });

		const https = login('open-sesame', undefined, 'https://rooms.example.com');
		await expect(https.result).rejects.toBeDefined();
		expect(https.cookies.set.mock.calls[0][2]).toMatchObject({ secure: true });
	});

	it('rejects a wrong or empty password without setting a cookie', async () => {
		for (const bad of ['wrong', '', 'open-sesame ']) {
			const { cookies, result } = login(bad);
			expect(await result).toMatchObject({ status: 400, data: { error: 'Incorrect password' } });
			expect(cookies.set).not.toHaveBeenCalled();
		}
	});

	it('returns to the page you were sent from', async () => {
		await expect(login('open-sesame', '/p/abc').result).rejects.toMatchObject({ location: '/p/abc' });
	});

	it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)', 'p/abc'])(
		'ignores the unsafe redirect target %j',
		async (next) => {
			await expect(login('open-sesame', next).result).rejects.toMatchObject({ location: '/' });
		}
	);
});

describe('login page load', () => {
	const run = (authenticated: boolean, next?: string) =>
		(load as never as (e: unknown) => unknown)({
			locals: { authenticated },
			url: new URL(`http://localhost/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
		});

	it('shows the form when signed out', () => {
		expect(run(false)).toBeUndefined();
	});
	it('skips the form when already signed in', () => {
		expect(() => run(true)).toThrow(expect.objectContaining({ status: 303, location: '/' }));
		expect(() => run(true, '/p/x')).toThrow(expect.objectContaining({ location: '/p/x' }));
		expect(() => run(true, '//evil.example')).toThrow(expect.objectContaining({ location: '/' }));
	});
});

describe('logout', () => {
	it('clears the cookie and goes to the login page', () => {
		const cookies = cookieJar();
		expect(() => (logout as never as (e: unknown) => void)({ cookies })).toThrow(
			expect.objectContaining({ status: 303, location: '/login' })
		);
		expect(cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
	});
});

describe('GET /api/photos/[...key]', () => {
	let ctx: ReturnType<typeof createContext>;
	beforeEach(async () => {
		ctx = createContext();
		await ctx.storage.put('projects/p1/a.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg');
	});
	const get = (key: string) =>
		(servePhoto as never as (e: unknown) => Promise<Response>)({ params: { key }, locals: ctx.locals });

	it('streams the photo with its type, length and long-lived private caching', async () => {
		const res = await get('projects/p1/a.jpg');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('content-length')).toBe('3');
		expect(res.headers.get('cache-control')).toContain('private');
		expect(res.headers.get('cache-control')).toContain('immutable');
		expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([1, 2, 3]);
	});

	it.each(['projects/p1/missing.jpg', '../secret', 'projects/../../secret', 'projects//a.jpg', '/etc/passwd', ''])(
		'404s for %j',
		async (key) => {
			await expect(get(key)).rejects.toMatchObject({ status: 404 });
		}
	);
});
