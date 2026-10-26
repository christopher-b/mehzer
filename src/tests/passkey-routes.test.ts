import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const env = vi.hoisted(() => ({ APP_URL: 'https://mehzur.example.com' }));
vi.mock('$app/env/private', () => ({
	APP_PASSWORD: 'open-sesame',
	SESSION_SECRET: 'unit-test-secret',
	MAIL_FROM: '',
	SMTP_HOST: '',
	SMTP_PORT: '',
	SMTP_USER: '',
	SMTP_PASSWORD: '',
	get APP_URL() {
		return env.APP_URL;
	}
}));

const login = await import('../routes/login/+page.server.ts');
const loginOptions = await import('../routes/login/passkey/options/+server.ts');
const loginVerify = await import('../routes/login/passkey/verify/+server.ts');
const addOptions = await import('../routes/account/passkeys/options/+server.ts');
const addVerify = await import('../routes/account/passkeys/verify/+server.ts');
const account = await import('../routes/account/+page.server.ts');
const { loginAttempts, passkeyChallenges, passkeys, sessions } = await import('#lib/server/db/schema.ts');
const { PASSKEY_COOKIE } = await import('#lib/server/passkeys.ts');
const { LOGIN_LIMIT_PER_IP } = await import('#lib/server/users.ts');
const { asUser, createContext, seedUser, TEST_USER } = await import('./helpers.ts');

type Handler = (event: never) => unknown;

function cookieJar(initial: Record<string, string> = {}) {
	return { set: vi.fn(), delete: vi.fn(), get: vi.fn((name: string) => initial[name]) };
}

function run(handler: Handler, ctx: { locals: App.Locals }, options: { body?: unknown; cookies?: ReturnType<typeof cookieJar>; ip?: string } = {}) {
	const request = new Request('https://mehzur.example.com/x', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: options.body === undefined ? undefined : JSON.stringify(options.body)
	});
	return Promise.resolve(
		handler({
			request,
			locals: ctx.locals,
			cookies: options.cookies ?? cookieJar(),
			url: new URL('https://mehzur.example.com/x'),
			getClientAddress: () => options.ip ?? '203.0.113.5'
		} as never)
	) as Promise<Response>;
}

const signedOut = (ctx: ReturnType<typeof createContext>) => ({ locals: { ...ctx.locals, user: null } as App.Locals });

describe('passkey settings', () => {
	it('every passkey endpoint answers 404 when APP_URL is not an https address', async () => {
		env.APP_URL = '';
		try {
			const ctx = createContext();
			for (const [handler, c] of [
				[loginOptions.POST, signedOut(ctx)],
				[loginVerify.POST, signedOut(ctx)],
				[addOptions.POST, ctx],
				[addVerify.POST, ctx]
			] as const) {
				await expect(run(handler as Handler, c, { body: { response: {} } })).rejects.toMatchObject({ status: 404 });
			}
			expect(await (account.load as Handler)({ locals: ctx.locals } as never)).toMatchObject({ passkeysAvailable: false });
		} finally {
			env.APP_URL = 'https://mehzur.example.com';
		}
	});

	it('the sign-in page and account page offer passkeys when it is', async () => {
		const ctx = createContext();
		expect(await (login.load as Handler)({ locals: signedOut(ctx).locals, url: new URL('https://x/login') } as never)).toEqual({ passkeys: true });
		expect(await (account.load as Handler)({ locals: ctx.locals } as never)).toMatchObject({ passkeysAvailable: true, passkeys: [] });
	});
});

describe('signing in with a passkey', () => {
	it('hands out options and remembers the challenge in a short-lived cookie that holds only an id', async () => {
		const ctx = createContext();
		const cookies = cookieJar();
		const res = await run(loginOptions.POST as Handler, signedOut(ctx), { cookies });
		const options = await res.json();
		expect(options.rpId).toBe('mehzur.example.com');
		const [, id, settings] = cookies.set.mock.calls[0];
		expect(cookies.set.mock.calls[0][0]).toBe(PASSKEY_COOKIE);
		expect(id).not.toContain(options.challenge);
		expect(settings).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', maxAge: 300 });
		const [row] = await ctx.db.select().from(passkeyChallenges);
		expect(row).toMatchObject({ id, challenge: options.challenge });
	});

	it('a wrong answer is a 400, starts no session and counts as a failed attempt', async () => {
		const ctx = createContext();
		const cookies = cookieJar();
		await run(loginOptions.POST as Handler, signedOut(ctx), { cookies });
		const challengeId = cookies.set.mock.calls[0][1];
		const verifyCookies = cookieJar({ [PASSKEY_COOKIE]: challengeId });
		const res = await run(loginVerify.POST as Handler, signedOut(ctx), {
			cookies: verifyCookies,
			body: { response: { id: 'unknown', rawId: 'unknown', type: 'public-key', response: {}, clientExtensionResults: {} } }
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ ok: false });
		expect(verifyCookies.delete).toHaveBeenCalledWith(PASSKEY_COOKIE, { path: '/' });
		expect(await ctx.db.select().from(sessions)).toEqual([]);
		expect(await ctx.db.select().from(loginAttempts).where(eq(loginAttempts.key, 'ip:203.0.113.5'))).toHaveLength(1);
	});

	it('too many failed attempts from one address are refused, for passkeys as for passwords', async () => {
		const ctx = createContext();
		await ctx.db.insert(loginAttempts).values(Array.from({ length: LOGIN_LIMIT_PER_IP }, () => ({ key: 'ip:203.0.113.5', at: new Date() })));
		await expect(run(loginOptions.POST as Handler, signedOut(ctx))).rejects.toMatchObject({ status: 429 });
		await expect(run(loginVerify.POST as Handler, signedOut(ctx), { body: { response: {} } })).rejects.toMatchObject({ status: 429 });
	});

	it('rejects a request without a body', async () => {
		const ctx = createContext();
		await expect(run(loginVerify.POST as Handler, signedOut(ctx))).rejects.toMatchObject({ status: 400 });
		await expect(run(loginVerify.POST as Handler, signedOut(ctx), { body: { response: null } })).rejects.toMatchObject({ status: 400 });
	});
});

describe('adding a passkey', () => {
	it('is only for someone who is signed in', async () => {
		const ctx = createContext();
		await expect(run(addOptions.POST as Handler, signedOut(ctx))).rejects.toMatchObject({ status: 401 });
	});

	it('hands out options for the signed-in person, and a wrong answer saves nothing', async () => {
		const ctx = createContext();
		const cookies = cookieJar();
		const options = await (await run(addOptions.POST as Handler, ctx, { cookies })).json();
		expect(options.user.name).toBe(TEST_USER.email);
		const challengeId = cookies.set.mock.calls[0][1];
		const res = await run(addVerify.POST as Handler, ctx, {
			cookies: cookieJar({ [PASSKEY_COOKIE]: challengeId }),
			body: { response: { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} }, name: 'Phone' }
		});
		expect(res.status).toBe(400);
		expect(await ctx.db.select().from(passkeys)).toEqual([]);
	});

	it("someone else's challenge cookie does not work", async () => {
		const ctx = createContext();
		const ben = await seedUser(ctx.db);
		const cookies = cookieJar();
		await run(addOptions.POST as Handler, ctx, { cookies });
		const res = await run(addVerify.POST as Handler, asUser(ctx, { id: ben.id, email: ben.email, name: ben.name, role: 'member' }), {
			cookies: cookieJar({ [PASSKEY_COOKIE]: cookies.set.mock.calls[0][1] }),
			body: { response: { id: 'x' }, name: 'Phone' }
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: expect.stringContaining('too long') });
	});
});
