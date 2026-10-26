import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const smtp = vi.hoisted(() => ({ host: 'smtp.example.com' }));

vi.mock('$app/env/private', () => ({
	APP_PASSWORD: 'open-sesame',
	SESSION_SECRET: 'unit-test-secret',
	APP_URL: 'https://mehzur.example.com/',
	get SMTP_HOST() {
		return smtp.host;
	},
	SMTP_PORT: '587',
	SMTP_USER: '',
	SMTP_PASSWORD: '',
	MAIL_FROM: 'Mehzur <mehzur@example.com>'
}));

const setup = await import('../routes/setup/+page.server.ts');
const forgot = await import('../routes/forgot/+page.server.ts');
const invitePage = await import('../routes/invite/[token]/+page.server.ts');
const resetPage = await import('../routes/reset/[token]/+page.server.ts');
const account = await import('../routes/account/+page.server.ts');
const admin = await import('../routes/admin/users/+page.server.ts');
const schema = await import('#lib/server/db/schema.ts');
const { setMailerForTests } = await import('#lib/server/email.ts');
const { createInvite, createPasswordReset } = await import('#lib/server/invites.ts');
const { createSession, findSession } = await import('#lib/server/sessions.ts');
const { createUser, findUserByEmail, requireAdmin } = await import('#lib/server/users.ts');
const { verifyPassword } = await import('#lib/server/password.ts');
const { SESSION_COOKIE } = await import('#lib/server/auth.ts');
const { asUser, createContext, formData, seedPhoto, seedProject, seedUser, TEST_USER } = await import('./helpers.ts');

const SECRET = 'unit-test-secret';
const PASSWORD = 'correct horse battery';

type Handler = (event: unknown) => Promise<unknown> | unknown;
const jar = (initial: Record<string, string> = {}) => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn((n: string) => initial[n]) });

function run(handler: Handler | undefined, ctx: { locals: App.Locals }, fields: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
	const cookies = jar();
	const url = new URL('https://mehzur.example.com/x');
	const promise = Promise.resolve(
		(handler as Handler)({
			request: new Request(url, { method: 'POST', body: formData(fields) }),
			cookies,
			url,
			params: {},
			locals: ctx.locals,
			getClientAddress: () => '203.0.113.9',
			...extra
		})
	);
	return { cookies, promise };
}

let sent: { to: string; subject: string; text: string }[] = [];
beforeEach(() => {
	sent = [];
	setMailerForTests(async (email) => void sent.push(email));
});

const signedOut = (ctx: ReturnType<typeof createContext>) => ({ ...ctx, locals: { ...ctx.locals, user: null } as App.Locals });

describe('first-run setup', () => {
	const fields = { setupPassword: 'open-sesame', name: 'Chris', email: 'Chris@Example.com', password: PASSWORD, confirm: PASSWORD };

	function emptyContext() {
		const ctx = createContext();
		return ctx.db.delete(schema.users).then(() => signedOut(ctx));
	}

	it('creates the admin with the setup password, signs in and claims the existing projects', async () => {
		const ctx = await emptyContext();
		const orphan = await seedProject(ctx.db, { ownerId: null });
		const { cookies, promise } = run(setup.actions.default as Handler, ctx, fields);
		await expect(promise).rejects.toMatchObject({ status: 303, location: '/' });

		const user = await findUserByEmail(ctx.db, 'chris@example.com');
		expect(user).toMatchObject({ role: 'admin', name: 'Chris' });
		expect((await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, orphan.id)))[0].ownerId).toBe(user!.id);
		const [, token] = cookies.set.mock.calls[0];
		expect((await findSession(ctx.db, SECRET, token))?.user.id).toBe(user!.id);
	});

	it('refuses a wrong setup password and a mismatching or weak new password', async () => {
		const ctx = await emptyContext();
		expect(await run(setup.actions.default as Handler, ctx, { ...fields, setupPassword: 'nope' }).promise).toMatchObject({ status: 400, data: { error: 'Incorrect setup password' } });
		expect(await run(setup.actions.default as Handler, ctx, { ...fields, confirm: 'different password' }).promise).toMatchObject({ status: 400 });
		expect(await run(setup.actions.default as Handler, ctx, { ...fields, password: 'short', confirm: 'short' }).promise).toMatchObject({ status: 400 });
		expect(await findUserByEmail(ctx.db, 'chris@example.com')).toBeUndefined();
	});

	it('locks after repeated wrong setup passwords', async () => {
		const ctx = await emptyContext();
		for (let i = 0; i < 5; i++) await run(setup.actions.default as Handler, ctx, { ...fields, setupPassword: 'nope' }).promise;
		expect(await run(setup.actions.default as Handler, ctx, fields).promise).toMatchObject({ status: 429 });
	});

	it('is gone (404) once any account exists', async () => {
		const ctx = signedOut(createContext());
		await expect(Promise.resolve((setup.load as Handler)({ locals: ctx.locals }))).rejects.toMatchObject({ status: 404 });
		await expect(run(setup.actions.default as Handler, ctx, fields).promise).rejects.toMatchObject({ status: 404 });
	});
});

describe('forgot password', () => {
	const ask = (ctx: ReturnType<typeof createContext>, email: string) => run(forgot.actions.default as Handler, signedOut(ctx), { email }).promise;

	it('emails a reset link to a known address and answers the same for an unknown one', async () => {
		const ctx = createContext();
		const known = await ask(ctx, TEST_USER.email);
		const unknown = await ask(ctx, 'nobody@example.com');
		expect(known).toEqual({ sent: true, email: TEST_USER.email });
		expect(unknown).toEqual({ sent: true, email: 'nobody@example.com' });
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ to: TEST_USER.email, subject: expect.stringContaining('Reset') });
		expect(sent[0].text).toMatch(/https:\/\/mehzur\.example\.com\/reset\/[A-Za-z0-9_-]{43}/);
	});

	it('sends nothing to a disabled account', async () => {
		const ctx = createContext();
		await ctx.db.update(schema.users).set({ disabledAt: new Date() });
		await ask(ctx, TEST_USER.email);
		expect(sent).toHaveLength(0);
	});

	it('limits how often one address can be asked about', async () => {
		const ctx = createContext();
		for (let i = 0; i < 5; i++) await ask(ctx, TEST_USER.email);
		expect(await ask(ctx, TEST_USER.email)).toMatchObject({ status: 429 });
		expect(sent).toHaveLength(5);
	});

	it('says so when email is not set up', async () => {
		setMailerForTests(undefined);
		smtp.host = '';
		try {
			expect(await ask(createContext(), TEST_USER.email)).toMatchObject({ unavailable: true });
		} finally {
			smtp.host = 'smtp.example.com';
		}
	});

	it('rejects something that is not an email address', async () => {
		expect(await ask(createContext(), 'not an email')).toMatchObject({ status: 400 });
	});
});

describe('invite page', () => {
	const accept = (ctx: ReturnType<typeof createContext>, token: string, fields: Record<string, string>) =>
		run(invitePage.actions.default as Handler, signedOut(ctx), fields, { params: { token } });

	it('shows whether the link is usable, and the address it is for', async () => {
		const ctx = createContext();
		const { token } = await createInvite(ctx.db, SECRET, { email: 'new@example.com', createdBy: TEST_USER.id });
		const load = (t: string) => Promise.resolve((invitePage.load as Handler)({ locals: ctx.locals, params: { token: t } }));
		expect(await load(token)).toEqual({ valid: true, email: 'new@example.com' });
		expect(await load('bad-token')).toEqual({ valid: false, email: null });
	});

	it('creates the account, signs the person in and uses up the link', async () => {
		const ctx = createContext();
		const { token } = await createInvite(ctx.db, SECRET, { email: null, createdBy: TEST_USER.id });
		const fields = { name: 'Ben', email: 'ben@example.com', password: PASSWORD, confirm: PASSWORD };
		const first = accept(ctx, token, fields);
		await expect(first.promise).rejects.toMatchObject({ status: 303, location: '/' });
		const [, cookie] = first.cookies.set.mock.calls[0];
		expect((await findSession(ctx.db, SECRET, cookie))?.user).toMatchObject({ email: 'ben@example.com', role: 'member' });
		expect(await accept(ctx, token, { ...fields, email: 'ben2@example.com' }).promise).toMatchObject({ status: 400 });
	});

	it('uses the address the invite was made for, whatever the form says', async () => {
		const ctx = createContext();
		const { token } = await createInvite(ctx.db, SECRET, { email: 'ben@example.com', createdBy: TEST_USER.id });
		await expect(accept(ctx, token, { name: 'Ben', email: 'other@example.com', password: PASSWORD, confirm: PASSWORD }).promise).rejects.toMatchObject({ status: 303 });
		expect(await findUserByEmail(ctx.db, 'ben@example.com')).toBeDefined();
		expect(await findUserByEmail(ctx.db, 'other@example.com')).toBeUndefined();
	});

	it('explains a mismatching password, a missing name and a bad link', async () => {
		const ctx = createContext();
		const { token } = await createInvite(ctx.db, SECRET, { email: null, createdBy: TEST_USER.id });
		const ok = { name: 'Ben', email: 'ben@example.com', password: PASSWORD, confirm: PASSWORD };
		expect(await accept(ctx, token, { ...ok, confirm: 'different password' }).promise).toMatchObject({ status: 400 });
		expect(await accept(ctx, token, { ...ok, name: '' }).promise).toMatchObject({ status: 400 });
		expect(await accept(ctx, 'bad-token', ok).promise).toMatchObject({ status: 400 });
	});
});

describe('reset page', () => {
	it('sets the password, ends every old session and signs in on this device', async () => {
		const ctx = createContext();
		const user = await seedUser(ctx.db);
		const old = await createSession(ctx.db, SECRET, user.id, null);
		const token = await createPasswordReset(ctx.db, SECRET, user.id);
		const { cookies, promise } = run(resetPage.actions.default as Handler, signedOut(ctx), { password: 'a brand new password', confirm: 'a brand new password' }, { params: { token } });
		await expect(promise).rejects.toMatchObject({ status: 303, location: '/' });
		expect(await findSession(ctx.db, SECRET, old)).toBeNull();
		const [, fresh] = cookies.set.mock.calls[0];
		expect((await findSession(ctx.db, SECRET, fresh))?.user.id).toBe(user.id);
		const after = await findUserByEmail(ctx.db, user.email);
		expect(await verifyPassword('a brand new password', after!.passwordHash)).toBe(true);
	});

	it('shows an expired or used link as invalid', async () => {
		const ctx = createContext();
		const load = Promise.resolve((resetPage.load as Handler)({ locals: ctx.locals, params: { token: 'nope' } }));
		expect(await load).toEqual({ valid: false });
	});
});

describe('account page', () => {
	async function member() {
		const ctx = createContext();
		const created = await createUser(ctx.db, { email: 'anna@example.com', name: 'Anna', password: PASSWORD });
		if ('error' in created) throw new Error(created.error);
		const u = created.user;
		const me = { id: u.id, email: u.email, name: u.name, role: u.role };
		const session = await createSession(ctx.db, SECRET, u.id, null);
		const active = await findSession(ctx.db, SECRET, session);
		return { ...asUser(ctx, me), user: u, session, locals: { ...ctx.locals, user: me, sessionId: active!.sessionId } as App.Locals };
	}

	it('changes the name', async () => {
		const s = await member();
		expect(await run(account.actions.profile as Handler, s, { name: ' Annie ' }).promise).toEqual({ profileSaved: true });
		expect((await findUserByEmail(s.db, 'anna@example.com'))!.name).toBe('Annie');
		expect(await run(account.actions.profile as Handler, s, { name: ' ' }).promise).toMatchObject({ status: 400 });
	});

	it('changes the password only with the right current one, and signs out other devices', async () => {
		const s = await member();
		const other = await createSession(s.db, SECRET, s.user.id, null);
		const next = { password: 'a brand new password', confirm: 'a brand new password' };
		expect(await run(account.actions.password as Handler, s, { ...next, current: 'wrong password' }).promise).toMatchObject({ status: 400 });
		expect(await run(account.actions.password as Handler, s, { ...next, current: PASSWORD, confirm: 'different' }).promise).toMatchObject({ status: 400 });

		expect(await run(account.actions.password as Handler, s, { ...next, current: PASSWORD }).promise).toEqual({ passwordSaved: true });
		expect(await findSession(s.db, SECRET, other)).toBeNull();
		expect(await findSession(s.db, SECRET, s.session)).not.toBeNull();
		expect(await verifyPassword('a brand new password', (await findUserByEmail(s.db, 'anna@example.com'))!.passwordHash)).toBe(true);
	});

	it('signs out other devices on request', async () => {
		const s = await member();
		const other = await createSession(s.db, SECRET, s.user.id, null);
		await run(account.actions.signOutOthers as Handler, s).promise;
		expect(await findSession(s.db, SECRET, other)).toBeNull();
		expect(await findSession(s.db, SECRET, s.session)).not.toBeNull();
	});

	it('deletes the account and all its projects after confirmation with email and password', async () => {
		const s = await member();
		const project = await seedProject(s.db, { ownerId: s.user.id });
		await seedPhoto(s.db, project.id, { blobKey: 'projects/x/1.jpg' });
		await s.storage.put('projects/x/1.jpg', new Uint8Array([1]), 'image/jpeg');

		expect(await run(account.actions.deleteAccount as Handler, s, { confirmEmail: 'wrong@example.com', current: PASSWORD }).promise).toMatchObject({ status: 400 });
		expect(await run(account.actions.deleteAccount as Handler, s, { confirmEmail: 'anna@example.com', current: 'wrong password' }).promise).toMatchObject({ status: 400 });
		expect(await findUserByEmail(s.db, 'anna@example.com')).toBeDefined();

		const { cookies, promise } = run(account.actions.deleteAccount as Handler, s, { confirmEmail: 'Anna@Example.com', current: PASSWORD });
		await expect(promise).rejects.toMatchObject({ status: 303, location: '/login' });
		expect(cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
		expect(await findUserByEmail(s.db, 'anna@example.com')).toBeUndefined();
		expect(await s.db.select().from(schema.projects).where(eq(schema.projects.id, project.id))).toHaveLength(0);
		expect(s.blobs.size).toBe(0);
	});

	it('does not let the administrator delete their account', async () => {
		const ctx = createContext(); // the test user is the admin
		expect(await run(account.actions.deleteAccount as Handler, ctx, { confirmEmail: TEST_USER.email, current: 'x' }).promise).toMatchObject({ status: 400 });
		expect(await findUserByEmail(ctx.db, TEST_USER.email)).toBeDefined();
	});
});

describe('administration', () => {
	const asMember = async () => {
		const ctx = createContext();
		const m = await seedUser(ctx.db);
		return { ctx, member: m, memberCtx: asUser(ctx, { id: m.id, email: m.email, name: m.name, role: 'member' }) };
	};

	it('is for the administrator only: everyone else gets a 404, for the page and every action', async () => {
		const { memberCtx } = await asMember();
		await expect(Promise.resolve((admin.load as Handler)({ locals: memberCtx.locals }))).rejects.toMatchObject({ status: 404 });
		for (const name of ['invite', 'revoke', 'resetLink', 'disable', 'enable', 'delete'] as const) {
			await expect(run(admin.actions[name] as Handler, memberCtx, { userId: 'x', inviteId: 'x', confirmEmail: 'x' }).promise).rejects.toMatchObject({ status: 404 });
		}
		expect(() => requireAdmin({ user: null })).toThrow();
	});

	it('lists people with their project counts, and the invites still waiting', async () => {
		const ctx = createContext();
		await seedProject(ctx.db);
		await createInvite(ctx.db, SECRET, { email: 'x@example.com', createdBy: TEST_USER.id });
		const data = (await (admin.load as Handler)({ locals: ctx.locals })) as { users: { email: string; projectCount: number }[]; invites: unknown[]; emailEnabled: boolean };
		expect(data.users[0]).toMatchObject({ email: TEST_USER.email, projectCount: 1 });
		expect(data.invites).toHaveLength(1);
		expect(data.emailEnabled).toBe(true);
	});

	it('creates an invite link on the public address, and emails it only when asked', async () => {
		const ctx = createContext();
		const plain = (await run(admin.actions.invite as Handler, ctx, { email: '' }).promise) as { inviteLink: string; emailed: boolean };
		expect(plain.inviteLink).toMatch(/^https:\/\/mehzur\.example\.com\/invite\/[A-Za-z0-9_-]{43}$/);
		expect(sent).toHaveLength(0);

		const mailed = (await run(admin.actions.invite as Handler, ctx, { email: 'Ben@Example.com', send: 'on' }).promise) as { emailed: boolean };
		expect(mailed.emailed).toBe(true);
		expect(sent[0]).toMatchObject({ to: 'ben@example.com' });
		expect(sent[0].text).toContain('/invite/');

		expect(await run(admin.actions.invite as Handler, ctx, { email: 'not an email' }).promise).toMatchObject({ status: 400 });
	});

	it('revokes an invite', async () => {
		const ctx = createContext();
		const { token, invite } = await createInvite(ctx.db, SECRET, { email: null, createdBy: TEST_USER.id });
		await run(admin.actions.revoke as Handler, ctx, { inviteId: invite.id }).promise;
		const { findUsableInvite } = await import('#lib/server/invites.ts');
		expect(await findUsableInvite(ctx.db, SECRET, token)).toBeNull();
	});

	it('makes a reset link for someone, disables and re-enables them, and deletes them with their projects', async () => {
		const ctx = createContext();
		const person = await seedUser(ctx.db);
		const theirs = await seedProject(ctx.db, { ownerId: person.id });
		const sessionToken = await createSession(ctx.db, SECRET, person.id, null);

		const reset = (await run(admin.actions.resetLink as Handler, ctx, { userId: person.id }).promise) as { resetLink: string };
		expect(reset.resetLink).toContain('/reset/');

		await run(admin.actions.disable as Handler, ctx, { userId: person.id }).promise;
		expect(await findSession(ctx.db, SECRET, sessionToken)).toBeNull();
		expect((await findUserByEmail(ctx.db, person.email))!.disabledAt).not.toBeNull();
		await run(admin.actions.enable as Handler, ctx, { userId: person.id }).promise;
		expect((await findUserByEmail(ctx.db, person.email))!.disabledAt).toBeNull();

		expect(await run(admin.actions.delete as Handler, ctx, { userId: person.id, confirmEmail: 'wrong@example.com' }).promise).toMatchObject({ status: 400 });
		await run(admin.actions.delete as Handler, ctx, { userId: person.id, confirmEmail: person.email }).promise;
		expect(await findUserByEmail(ctx.db, person.email)).toBeUndefined();
		expect(await ctx.db.select().from(schema.projects).where(eq(schema.projects.id, theirs.id))).toHaveLength(0);
	});

	it('will not disable or delete the administrator themselves', async () => {
		const ctx = createContext();
		expect(await run(admin.actions.disable as Handler, ctx, { userId: TEST_USER.id }).promise).toMatchObject({ status: 400 });
		expect(await run(admin.actions.delete as Handler, ctx, { userId: TEST_USER.id, confirmEmail: TEST_USER.email }).promise).toMatchObject({ status: 400 });
		expect(await findUserByEmail(ctx.db, TEST_USER.email)).toBeDefined();
	});
});
