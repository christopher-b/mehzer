import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { passkeyChallenges, passkeys, users } from './db/schema.ts';
import {
	MAX_PASSKEYS_PER_USER,
	PASSKEY_CHALLENGE_TTL_MS,
	PASSKEY_SIGN_IN_FAILED,
	beginLogin,
	beginRegistration,
	finishLogin,
	finishRegistration,
	listPasskeys,
	parsePasskeyName,
	passkeySettings,
	removePasskey,
	renamePasskey
} from './passkeys.ts';
import { deleteUserAndContent } from './users.ts';
import { TEST_USER, createContext, seedUser } from '../../tests/helpers.ts';

const settings = passkeySettings('https://mehzur.example.com')!;
const NOW = 1_800_000_000_000;

const garbageRegistration = { id: 'x', rawId: 'x', type: 'public-key', response: { clientDataJSON: 'e30', attestationObject: 'e30' }, clientExtensionResults: {} } as unknown as RegistrationResponseJSON;
const garbageLogin = (id: string) =>
	({ id, rawId: id, type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'e30', signature: 'e30' }, clientExtensionResults: {} }) as unknown as AuthenticationResponseJSON;

async function seedPasskey(db: ReturnType<typeof createContext>['db'], userId: string, values: Partial<typeof passkeys.$inferInsert> = {}) {
	const [row] = await db
		.insert(passkeys)
		.values({ userId, credentialId: `cred${Math.random().toString(36).slice(2)}`, publicKey: 'AAAA', name: 'Phone', ...values })
		.returning();
	return row;
}

describe('passkeySettings (the production settings come from APP_URL)', () => {
	it('binds to the host and origin of an https address', () => {
		expect(passkeySettings('https://mehzur.cbennell.com')).toEqual({ rpID: 'mehzur.cbennell.com', origin: 'https://mehzur.cbennell.com', rpName: 'Mehzur' });
		expect(passkeySettings('https://mehzur.cbennell.com/some/path/')).toMatchObject({ rpID: 'mehzur.cbennell.com', origin: 'https://mehzur.cbennell.com' });
		expect(passkeySettings('https://example.com:8443')).toMatchObject({ rpID: 'example.com', origin: 'https://example.com:8443' });
	});

	it('allows localhost over plain http for development', () => {
		expect(passkeySettings('http://localhost:5173')).toEqual({ rpID: 'localhost', origin: 'http://localhost:5173', rpName: 'Mehzur' });
	});

	it.each(['', 'not a url', 'http://mehzur.cbennell.com', 'http://192.168.1.20:3000', 'ftp://example.com'])('is off for %j', (value) => {
		expect(passkeySettings(value)).toBeNull();
	});
});

describe('managing passkeys', () => {
	it('lists, renames and removes only your own', async () => {
		const { db } = createContext();
		const ben = await seedUser(db);
		const mine = await seedPasskey(db, TEST_USER.id, { name: 'Laptop' });
		const theirs = await seedPasskey(db, ben.id, { name: 'Ben phone' });

		expect((await listPasskeys(db, TEST_USER.id)).map((p) => p.name)).toEqual(['Laptop']);
		expect(await renamePasskey(db, TEST_USER.id, theirs.id, 'Mine now')).toBe(false);
		expect(await removePasskey(db, TEST_USER.id, theirs.id)).toBe(false);
		expect((await db.select().from(passkeys).where(eq(passkeys.id, theirs.id)))[0].name).toBe('Ben phone');

		expect(await renamePasskey(db, TEST_USER.id, mine.id, 'Work laptop')).toBe(true);
		expect((await listPasskeys(db, TEST_USER.id))[0]).toMatchObject({ name: 'Work laptop', lastUsedAt: null });
		expect(await removePasskey(db, TEST_USER.id, mine.id)).toBe(true);
		expect(await listPasskeys(db, TEST_USER.id)).toEqual([]);
	});

	it('does not expose the key material in the list', async () => {
		const { db } = createContext();
		await seedPasskey(db, TEST_USER.id);
		expect(Object.keys((await listPasskeys(db, TEST_USER.id))[0]).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name']);
	});

	it('names a passkey sensibly', () => {
		expect(parsePasskeyName('  Phone ')).toBe('Phone');
		expect(parsePasskeyName('')).toBe('Passkey');
		expect(parsePasskeyName(null)).toBe('Passkey');
		expect(parsePasskeyName('x'.repeat(500)).length).toBeLessThanOrEqual(100);
	});

	it('are deleted with the account', async () => {
		const { db, storage } = createContext();
		const ben = await seedUser(db);
		await seedPasskey(db, ben.id);
		await deleteUserAndContent(db, storage, ben.id);
		expect(await db.select().from(passkeys)).toEqual([]);
	});
});

describe('registration', () => {
	it('asks for a device-verified, discoverable passkey bound to the site, and skips ones you already have', async () => {
		const { db } = createContext();
		const existing = await seedPasskey(db, TEST_USER.id, { credentialId: 'already-here' });
		const { options, challengeId } = await beginRegistration(db, settings, { ...TEST_USER }, NOW);
		expect(options.rp).toEqual({ id: 'mehzur.example.com', name: 'Mehzur' });
		expect(options.user).toMatchObject({ name: TEST_USER.email, displayName: TEST_USER.name });
		expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' });
		expect(options.excludeCredentials?.map((c) => c.id)).toEqual([existing.credentialId]);
		const [row] = await db.select().from(passkeyChallenges).where(eq(passkeyChallenges.id, challengeId));
		expect(row).toMatchObject({ challenge: options.challenge, kind: 'register', userId: TEST_USER.id });
		expect(row.expiresAt.getTime()).toBe(NOW + PASSKEY_CHALLENGE_TTL_MS);
	});

	it('refuses a wrong answer and uses up the challenge either way', async () => {
		const { db } = createContext();
		const { challengeId } = await beginRegistration(db, settings, { ...TEST_USER }, NOW);
		const input = { challengeId, response: garbageRegistration, name: 'Phone' };
		expect(await finishRegistration(db, settings, TEST_USER, input, NOW + 1000)).toMatchObject({ ok: false });
		expect(await listPasskeys(db, TEST_USER.id)).toEqual([]);
		expect(await db.select().from(passkeyChallenges)).toEqual([]);
		// the same challenge cannot be tried again
		expect(await finishRegistration(db, settings, TEST_USER, input, NOW + 2000)).toMatchObject({ ok: false, error: expect.stringContaining('too long') });
	});

	it("refuses an expired challenge, one made for someone else, and a missing one", async () => {
		const { db } = createContext();
		const ben = await seedUser(db);
		const expired = await beginRegistration(db, settings, { ...TEST_USER }, NOW);
		expect(await finishRegistration(db, settings, TEST_USER, { challengeId: expired.challengeId, response: garbageRegistration, name: 'x' }, NOW + PASSKEY_CHALLENGE_TTL_MS + 1)).toMatchObject({ error: expect.stringContaining('too long') });

		const mine = await beginRegistration(db, settings, { ...TEST_USER }, NOW);
		expect(await finishRegistration(db, settings, ben, { challengeId: mine.challengeId, response: garbageRegistration, name: 'x' }, NOW)).toMatchObject({ error: expect.stringContaining('too long') });

		expect(await finishRegistration(db, settings, TEST_USER, { challengeId: undefined, response: garbageRegistration, name: 'x' }, NOW)).toMatchObject({ ok: false });
	});

	it(`stops at ${MAX_PASSKEYS_PER_USER} passkeys`, async () => {
		const { db } = createContext();
		for (let i = 0; i < MAX_PASSKEYS_PER_USER; i++) await seedPasskey(db, TEST_USER.id);
		const { challengeId } = await beginRegistration(db, settings, { ...TEST_USER }, NOW);
		expect(await finishRegistration(db, settings, TEST_USER, { challengeId, response: garbageRegistration, name: 'x' }, NOW)).toMatchObject({ error: expect.stringContaining('up to') });
	});

	it('clears out old challenges when a new one is made', async () => {
		const { db } = createContext();
		await beginRegistration(db, settings, { ...TEST_USER }, NOW);
		await beginRegistration(db, settings, { ...TEST_USER }, NOW + PASSKEY_CHALLENGE_TTL_MS + 10);
		expect(await db.select().from(passkeyChallenges)).toHaveLength(1);
	});
});

describe('signing in', () => {
	it('offers no list of credentials (the device picks) and demands device verification', async () => {
		const { db } = createContext();
		const { options, challengeId } = await beginLogin(db, settings, NOW);
		expect(options.rpId).toBe('mehzur.example.com');
		expect(options.userVerification).toBe('required');
		expect(options.allowCredentials ?? []).toEqual([]);
		const [row] = await db.select().from(passkeyChallenges).where(eq(passkeyChallenges.id, challengeId));
		expect(row).toMatchObject({ kind: 'login', userId: null });
	});

	it('refuses an unknown passkey, a wrong answer, a disabled account, a reused or registration challenge', async () => {
		const { db } = createContext();
		const failed = { ok: false, error: PASSKEY_SIGN_IN_FAILED };
		const login = async (id: string) => finishLogin(db, settings, { challengeId: (await beginLogin(db, settings, NOW)).challengeId, response: garbageLogin(id) }, NOW);

		expect(await login('nobody')).toEqual(failed);

		const known = await seedPasskey(db, TEST_USER.id, { credentialId: 'known' });
		expect(await login('known')).toEqual(failed); // not a real signature
		expect((await db.select().from(passkeys).where(eq(passkeys.id, known.id)))[0]).toMatchObject({ counter: 0, lastUsedAt: null });

		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, TEST_USER.id));
		expect(await login('known')).toEqual(failed);

		const challenge = (await beginLogin(db, settings, NOW)).challengeId;
		await finishLogin(db, settings, { challengeId: challenge, response: garbageLogin('known') }, NOW);
		expect(await finishLogin(db, settings, { challengeId: challenge, response: garbageLogin('known') }, NOW)).toEqual(failed);

		const registration = (await beginRegistration(db, settings, { ...TEST_USER }, NOW)).challengeId;
		expect(await finishLogin(db, settings, { challengeId: registration, response: garbageLogin('known') }, NOW)).toEqual(failed);
		expect(await finishLogin(db, settings, { challengeId: undefined, response: garbageLogin('known') }, NOW)).toEqual(failed);
	});
});
