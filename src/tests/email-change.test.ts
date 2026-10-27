import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('$app/env/private', () => ({
	APP_PASSWORD: 'open-sesame',
	SESSION_SECRET: 'unit-test-secret',
	APP_URL: 'https://mehzur.test/',
	MAIL_FROM: 'mehzur@example.com',
	SMTP_HOST: '',
	SMTP_PORT: '',
	SMTP_USER: '',
	SMTP_PASSWORD: ''
}));

const { actions, load } = await import('../routes/account/+page.server.ts');
const { actions: confirmActions, load: confirmLoad } = await import('../routes/account/email/[token]/+page.server.ts');
const { emailChanges, sessions, users } = await import('#lib/server/db/schema.ts');
const { setMailerForTests } = await import('#lib/server/email.ts');
const { EMAIL_CHANGE_TTL_MS, createEmailChange, completeEmailChange } = await import('#lib/server/emailChange.ts');
const { hashPassword } = await import('#lib/server/password.ts');
const { createSession } = await import('#lib/server/sessions.ts');
const { asUser, call, callLoad, createContext, failure, formData, seedUser, TEST_USER } = await import('./helpers.ts');
type Email = import('#lib/server/email.ts').Email;

const SECRET = 'unit-test-secret';
const PASSWORD = 'correct horse battery';

async function setup() {
	const ctx = createContext();
	await ctx.db.update(users).set({ passwordHash: await hashPassword(PASSWORD) }).where(eq(users.id, TEST_USER.id));
	const mine = await createSession(ctx.db, SECRET, TEST_USER.id, 'this device');
	await createSession(ctx.db, SECRET, TEST_USER.id, 'other device');
	const [current] = await ctx.db.select().from(sessions).where(eq(sessions.userAgent, 'this device'));
	const locals = { ...ctx.locals, sessionId: current.id };
	return { ...ctx, locals, mine };
}

const submit = (locals: App.Locals, fields: Record<string, string>) =>
	call(actions.email as never, { locals, form: formData({ current: PASSWORD, ...fields }) }) as Promise<Record<string, unknown>>;

const emailOf = async (db: Awaited<ReturnType<typeof setup>>['db']) =>
	(await db.select().from(users).where(eq(users.id, TEST_USER.id)))[0].email;

describe('changing your email address without email set up', () => {
	beforeEach(() => setMailerForTests(undefined));

	it('changes at once, signs the other devices out and keeps this one', async () => {
		const s = await setup();
		const result = await submit(s.locals, { email: '  New@Example.com ' });
		expect(result).toEqual({ emailChanged: 'new@example.com' });
		expect(await emailOf(s.db)).toBe('new@example.com');
		const remaining = await s.db.select().from(sessions).where(eq(sessions.userId, TEST_USER.id));
		expect(remaining.map((r) => r.userAgent)).toEqual(['this device']);
		expect((await callLoad<{ emailConfirmation: boolean }>(load as never, { locals: s.locals })).emailConfirmation).toBe(false);
	});

	it.each([
		['a wrong password', { current: 'wrong password!!', email: 'new@example.com' }, 'password'],
		['something that is not an address', { email: 'nope' }, 'valid'],
		['your current address', { email: TEST_USER.email }, 'already your'],
		['an address that has an account', { email: 'taken@example.com' }, 'already has an account']
	])('refuses %s and changes nothing', async (_name, fields, message) => {
		const s = await setup();
		await seedUser(s.db, { email: 'taken@example.com' });
		const result = (await submit(s.locals, fields)) as unknown as { status: number; data: { emailError: string } };
		expect(result.status).toBe(400);
		expect(result.data.emailError).toContain(message);
		expect(await emailOf(s.db)).toBe(TEST_USER.email);
		expect(await s.db.select().from(sessions).where(eq(sessions.userId, TEST_USER.id))).toHaveLength(2);
	});
});

describe('guessing the current password on the account page', () => {
	beforeEach(() => setMailerForTests(undefined));

	it('is refused with 429 after 5 wrong attempts, even for the right password', async () => {
		const s = await setup();
		for (let i = 0; i < 5; i++) {
			expect(failure(await submit(s.locals, { email: 'x@example.com', current: 'wrong' }))?.status).toBe(400);
		}
		const blocked = failure(await submit(s.locals, { email: 'x@example.com', current: 'wrong' }));
		expect(blocked?.status).toBe(429);
		expect(await submit(s.locals, { email: 'x@example.com', current: 'wrong' })).toMatchObject({
			data: { emailError: expect.stringContaining('Too many attempts') }
		});
		expect(failure(await submit(s.locals, { email: 'x@example.com' }))?.status).toBe(429);
		expect(await emailOf(s.db)).toBe(TEST_USER.email);
	});

	it('a right password clears the count', async () => {
		const s = await setup();
		for (let i = 0; i < 4; i++) await submit(s.locals, { email: 'x@example.com', current: 'wrong' });
		expect(await submit(s.locals, { email: 'x@example.com' })).toEqual({ emailChanged: 'x@example.com' });
		for (let i = 0; i < 4; i++) {
			expect(failure(await submit(s.locals, { email: 'y@example.com', current: 'wrong' }))?.status).toBe(400);
		}
	});
});

describe('changing your email address with email set up', () => {
	let sent: Email[];
	beforeEach(() => {
		sent = [];
		setMailerForTests(async (email) => void sent.push(email));
	});

	it('emails a link to the new address and changes nothing until it is used', async () => {
		const s = await setup();
		const result = await submit(s.locals, { email: 'new@example.com' });
		expect(result).toEqual({ emailSentTo: 'new@example.com' });
		expect(await emailOf(s.db)).toBe(TEST_USER.email);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('new@example.com');
		expect(sent[0].text).toMatch(/https:\/\/mehzur\.test\/account\/email\/[\w-]+/);
		expect((await callLoad<{ emailConfirmation: boolean }>(load as never, { locals: s.locals })).emailConfirmation).toBe(true);
	});

	it('opening the link shows the change; confirming applies it once, notifies the old address and signs other devices out', async () => {
		const s = await setup();
		await submit(s.locals, { email: 'new@example.com' });
		const token = sent[0].text.match(/\/account\/email\/([\w-]+)/)![1];
		const params = { token };

		expect(await callLoad(confirmLoad as never, { locals: s.locals, params })).toEqual({ newEmail: 'new@example.com' });
		expect(await emailOf(s.db)).toBe(TEST_USER.email);

		expect(await call(confirmActions.default as never, { locals: s.locals, params })).toEqual({ changed: 'new@example.com' });
		expect(await emailOf(s.db)).toBe('new@example.com');
		expect(sent[1]).toMatchObject({ to: TEST_USER.email, subject: expect.stringContaining('changed') });
		expect(sent[1].text).toContain('new@example.com');
		expect(await s.db.select().from(sessions).where(eq(sessions.userId, TEST_USER.id))).toHaveLength(1);

		expect(await callLoad(confirmLoad as never, { locals: s.locals, params })).toEqual({ newEmail: null });
		expect(failure(await call(confirmActions.default as never, { locals: s.locals, params }))?.status).toBe(400);
	});

	it("a link only works for the account it was made for", async () => {
		const s = await setup();
		await submit(s.locals, { email: 'new@example.com' });
		const token = sent[0].text.match(/\/account\/email\/([\w-]+)/)![1];
		const ben = await seedUser(s.db);
		const other = asUser(s, { id: ben.id, email: ben.email, name: ben.name, role: 'member' });
		expect(await callLoad(confirmLoad as never, { locals: other.locals, params: { token } })).toEqual({ newEmail: null });
		expect(failure(await call(confirmActions.default as never, { locals: other.locals, params: { token } }))?.status).toBe(400);
		expect(await emailOf(s.db)).toBe(TEST_USER.email);
	});

	it('a newer request cancels the older link', async () => {
		const s = await setup();
		await submit(s.locals, { email: 'one@example.com' });
		await submit(s.locals, { email: 'two@example.com' });
		const [first, second] = sent.map((m) => m.text.match(/\/account\/email\/([\w-]+)/)![1]);
		expect(failure(await call(confirmActions.default as never, { locals: s.locals, params: { token: first } }))?.status).toBe(400);
		expect(await call(confirmActions.default as never, { locals: s.locals, params: { token: second } })).toEqual({ changed: 'two@example.com' });
	});

	it('refuses if the address was taken in the meantime, and after an hour', async () => {
		const s = await setup();
		const token = await createEmailChange(s.db, SECRET, TEST_USER.id, 'late@example.com', 1_000);
		expect(await completeEmailChange(s.db, SECRET, TEST_USER.id, token, undefined, 1_000 + EMAIL_CHANGE_TTL_MS + 1)).toMatchObject({ error: expect.any(String) });

		const token2 = await createEmailChange(s.db, SECRET, TEST_USER.id, 'taken@example.com');
		await seedUser(s.db, { email: 'taken@example.com' });
		expect(await completeEmailChange(s.db, SECRET, TEST_USER.id, token2)).toMatchObject({ error: expect.stringContaining('already has an account') });
		expect(await emailOf(s.db)).toBe(TEST_USER.email);
		// the link is not used up: once the address is free again it still works
		await s.db.delete(users).where(eq(users.email, 'taken@example.com'));
		expect(await completeEmailChange(s.db, SECRET, TEST_USER.id, token2)).toMatchObject({ newEmail: 'taken@example.com' });
	});

	it('stores only a hash of the link token, and a failed send is reported', async () => {
		const s = await setup();
		await submit(s.locals, { email: 'new@example.com' });
		const token = sent[0].text.match(/\/account\/email\/([\w-]+)/)![1];
		const [row] = await s.db.select().from(emailChanges);
		expect(row.tokenHash).not.toContain(token);

		setMailerForTests(async () => {
			throw new Error('smtp down');
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(failure(await submit(s.locals, { email: 'other@example.com' }))?.status).toBe(500);
	});

	it('limits how often you can ask', async () => {
		const s = await setup();
		for (let i = 0; i < 5; i++) await submit(s.locals, { email: `try${i}@example.com` });
		expect(failure(await submit(s.locals, { email: 'more@example.com' }))?.status).toBe(429);
	});
});
