import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ APP_PASSWORD: 'open-sesame', SESSION_SECRET: 'unit-test-secret', APP_URL: '' }));

const { actions, load } = await import('../routes/login/+page.server.ts');
const { POST: logout } = await import('../routes/logout/+server.ts');
const { GET: servePhoto } = await import('../routes/api/photos/[...key]/+server.ts');
const { projectMembers, projects } = await import('#lib/server/db/schema.ts');
const { SESSION_COOKIE } = await import('#lib/server/auth.ts');
const { findSession, createSession } = await import('#lib/server/sessions.ts');
const { createUser, LOGIN_LIMIT_PER_EMAIL } = await import('#lib/server/users.ts');
const { asUser, createContext, seedPhoto, seedProject, seedUser, TEST_USER } = await import('./helpers.ts');

const SECRET = 'unit-test-secret';
const PASSWORD = 'correct horse battery';

function cookieJar(initial: Record<string, string> = {}) {
	return { set: vi.fn(), delete: vi.fn(), get: vi.fn((name: string) => initial[name]) };
}

async function setup() {
	const ctx = createContext();
	const created = await createUser(ctx.db, { email: 'anna@example.com', name: 'Anna', password: PASSWORD });
	if ('error' in created) throw new Error(created.error);
	// Sign-in is looked up in the database: the context's own locals are signed out for these tests.
	return { ...ctx, anna: created.user, locals: { ...ctx.locals, user: null } as App.Locals };
}

describe('login action', () => {
	let s: Awaited<ReturnType<typeof setup>>;
	beforeEach(async () => {
		s = await setup();
	});

	const login = (email: string, password: string, next?: string, origin = 'http://localhost') => {
		const cookies = cookieJar();
		const body = new FormData();
		body.set('email', email);
		body.set('password', password);
		const url = new URL(`${origin}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
		const result = (actions.default as never as (e: unknown) => Promise<unknown>)({
			request: new Request(url, { method: 'POST', body, headers: { 'user-agent': 'test-browser' } }),
			cookies,
			url,
			locals: s.locals,
			getClientAddress: () => '203.0.113.9'
		});
		return { cookies, result };
	};

	it('starts a session for the right email and password and redirects home', async () => {
		const { cookies, result } = login('anna@example.com', PASSWORD);
		await expect(result).rejects.toMatchObject({ status: 303, location: '/' });
		const [name, token, options] = cookies.set.mock.calls[0];
		expect(name).toBe(SESSION_COOKIE);
		expect((await findSession(s.db, SECRET, token))?.user).toMatchObject({ id: s.anna.id, name: 'Anna', role: 'member' });
		expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
	});

	it('ignores capitals and spaces in the email address', async () => {
		await expect(login('  Anna@Example.COM ', PASSWORD).result).rejects.toMatchObject({ status: 303 });
	});

	it('marks the cookie Secure only when served over https (so plain-http LAN use works)', async () => {
		const http = login('anna@example.com', PASSWORD, undefined, 'http://192.168.1.20:3000');
		await expect(http.result).rejects.toBeDefined();
		expect(http.cookies.set.mock.calls[0][2]).toMatchObject({ secure: false });
		const https = login('anna@example.com', PASSWORD, undefined, 'https://mehzur.example.com');
		await expect(https.result).rejects.toBeDefined();
		expect(https.cookies.set.mock.calls[0][2]).toMatchObject({ secure: true });
	});

	it('rejects a wrong password, an unknown email and an empty form the same way, with no cookie', async () => {
		for (const [email, password] of [
			['anna@example.com', 'wrong password'],
			['nobody@example.com', PASSWORD],
			['', ''],
			['anna@example.com', PASSWORD + ' ']
		]) {
			const { cookies, result } = login(email, password);
			expect(await result).toMatchObject({ status: 400, data: { error: 'Incorrect email or password' } });
			expect(cookies.set).not.toHaveBeenCalled();
		}
	});

	it('refuses a disabled account even with the right password', async () => {
		const { users } = await import('#lib/server/db/schema.ts');
		const { eq } = await import('drizzle-orm');
		await s.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, s.anna.id));
		expect(await login('anna@example.com', PASSWORD).result).toMatchObject({ status: 400 });
	});

	it('blocks further attempts after too many failures, even with the right password', async () => {
		for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL; i++) await login('anna@example.com', 'nope nope nope').result;
		expect(await login('anna@example.com', PASSWORD).result).toMatchObject({ status: 429 });
	});

	it('forgets earlier failures after a successful sign-in', async () => {
		for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL - 1; i++) await login('anna@example.com', 'nope nope nope').result;
		await expect(login('anna@example.com', PASSWORD).result).rejects.toMatchObject({ status: 303 });
		for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL - 1; i++) {
			expect(await login('anna@example.com', 'nope nope nope').result).toMatchObject({ status: 400 });
		}
	});

	it('returns to the page you were sent from', async () => {
		await expect(login('anna@example.com', PASSWORD, '/p/abc').result).rejects.toMatchObject({ location: '/p/abc' });
	});

	it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)', 'p/abc'])(
		'ignores the unsafe redirect target %j',
		async (next) => {
			await expect(login('anna@example.com', PASSWORD, next).result).rejects.toMatchObject({ location: '/' });
		}
	);
});

describe('login page load', () => {
	const run = (locals: unknown, next?: string) =>
		(load as never as (e: unknown) => Promise<unknown>)({
			locals,
			url: new URL(`http://localhost/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
		});

	it('shows the form when signed out and accounts exist', async () => {
		const ctx = createContext();
		expect(await run({ ...ctx.locals, user: null })).toEqual({ passkeys: false }); // no APP_URL: no passkeys
	});
	it('sends you to set up the first account when there are none', async () => {
		const ctx = createContext();
		const { users } = await import('#lib/server/db/schema.ts');
		await ctx.db.delete(users);
		await expect(run({ ...ctx.locals, user: null })).rejects.toMatchObject({ status: 303, location: '/setup' });
	});
	it('skips the form when already signed in', async () => {
		const ctx = createContext();
		await expect(run(ctx.locals)).rejects.toMatchObject({ status: 303, location: '/' });
		await expect(run(ctx.locals, '/p/x')).rejects.toMatchObject({ location: '/p/x' });
		await expect(run(ctx.locals, '//evil.example')).rejects.toMatchObject({ location: '/' });
	});
});

describe('logout', () => {
	it('ends the session, clears the cookie and goes to the login page', async () => {
		const s = await setup();
		const token = await createSession(s.db, SECRET, s.anna.id, null);
		expect(await findSession(s.db, SECRET, token)).not.toBeNull();
		const cookies = cookieJar({ [SESSION_COOKIE]: token });
		await expect(
			(logout as never as (e: unknown) => Promise<void>)({ cookies, locals: s.locals })
		).rejects.toMatchObject({ status: 303, location: '/login' });
		expect(cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
		expect(await findSession(s.db, SECRET, token)).toBeNull();
	});
});

describe('GET /api/photos/[...key]', () => {
	let ctx: ReturnType<typeof createContext>;
	let key: string;
	beforeEach(async () => {
		ctx = createContext();
		const project = await seedProject(ctx.db);
		const photo = await seedPhoto(ctx.db, project.id, { blobKey: 'projects/p1/a.jpg' });
		key = photo.blobKey;
		await ctx.storage.put(key, new Uint8Array([1, 2, 3]), 'image/jpeg');
	});
	const get = (k: string, locals = ctx.locals) =>
		(servePhoto as never as (e: unknown) => Promise<Response>)({ params: { key: k }, locals });

	it('streams the photo with its type, length and long-lived private caching', async () => {
		const res = await get(key);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('content-length')).toBe('3');
		expect(res.headers.get('cache-control')).toContain('private');
		expect(res.headers.get('cache-control')).toContain('immutable');
		expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([1, 2, 3]);
	});

	it("404s for another user's photo, even though the file exists", async () => {
		const other = await seedUser(ctx.db);
		const theirs = asUser(ctx, { id: other.id, email: other.email, name: other.name, role: 'member' });
		await expect(get(key, theirs.locals)).rejects.toMatchObject({ status: 404 });
	});

	it("serves a guest the photos of a project that is shared with them, until they are removed", async () => {
		const other = await seedUser(ctx.db);
		const guest = asUser(ctx, { id: other.id, email: other.email, name: other.name, role: 'member' });
		const [project] = await ctx.db.select().from(projects);
		await ctx.db.insert(projectMembers).values({ projectId: project.id, userId: other.id });
		expect((await get(key, guest.locals)).status).toBe(200);
		await ctx.db.delete(projectMembers);
		await expect(get(key, guest.locals)).rejects.toMatchObject({ status: 404 });
	});

	it('404s for a stored file that no photo row points to', async () => {
		await ctx.storage.put('projects/p1/orphan.jpg', new Uint8Array([9]), 'image/jpeg');
		await expect(get('projects/p1/orphan.jpg')).rejects.toMatchObject({ status: 404 });
	});

	it.each(['projects/p1/missing.jpg', '../secret', 'projects/../../secret', 'projects//a.jpg', '/etc/passwd', ''])(
		'404s for %j',
		async (k) => {
			await expect(get(k)).rejects.toMatchObject({ status: 404 });
		}
	);

	it('needs a signed-in user', async () => {
		await expect(get(key, { ...ctx.locals, user: null } as App.Locals)).rejects.toMatchObject({ status: 401 });
		expect(TEST_USER.id).toBeTruthy();
	});
});
