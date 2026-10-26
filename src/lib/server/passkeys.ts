import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { and, eq, lt } from 'drizzle-orm';
import { NAME_MAX_LENGTH } from '#lib/constants.ts';
import { randomToken } from './auth.ts';
import { passkeyChallenges, passkeys, users, type User } from './db/schema.ts';
import type { Db } from './db/types.ts';

export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MAX_PASSKEYS_PER_USER = 10;
export const PASSKEY_COOKIE = 'mehzur_passkey';

export interface PasskeySettings {
	/** The domain passkeys are bound to: the host of APP_URL. */
	rpID: string;
	/** The only origin a passkey ceremony is accepted from: APP_URL's. */
	origin: string;
	rpName: string;
}

/**
 * Passkeys are bound to the public address (`APP_URL`), never to the request's Host header. They work on
 * https, and on localhost for development; anywhere else (no `APP_URL`, or plain http on a LAN) they are off.
 */
export function passkeySettings(appUrl: string): PasskeySettings | null {
	let url: URL;
	try {
		url = new URL(appUrl);
	} catch {
		return null;
	}
	const local = url.hostname === 'localhost';
	if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
	return { rpID: url.hostname, origin: url.origin, rpName: 'Mehzur' };
}

export interface PasskeySummary {
	id: string;
	name: string;
	createdAt: Date;
	lastUsedAt: Date | null;
}

export async function listPasskeys(db: Db, userId: string): Promise<PasskeySummary[]> {
	const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId)).orderBy(passkeys.createdAt);
	return rows.map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt }));
}

export function parsePasskeyName(value: FormDataEntryValue | null | undefined): string {
	const name = String(value ?? '').trim();
	return name.slice(0, NAME_MAX_LENGTH) || 'Passkey';
}

export async function renamePasskey(db: Db, userId: string, id: string, name: string): Promise<boolean> {
	const done = await db
		.update(passkeys)
		.set({ name })
		.where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
		.returning({ id: passkeys.id });
	return done.length > 0;
}

export async function removePasskey(db: Db, userId: string, id: string): Promise<boolean> {
	const done = await db
		.delete(passkeys)
		.where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
		.returning({ id: passkeys.id });
	return done.length > 0;
}

async function saveChallenge(db: Db, input: { challenge: string; kind: 'register' | 'login'; userId?: string }, now: number) {
	await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, new Date(now)));
	const id = randomToken();
	await db.insert(passkeyChallenges).values({
		id,
		challenge: input.challenge,
		kind: input.kind,
		userId: input.userId ?? null,
		expiresAt: new Date(now + PASSKEY_CHALLENGE_TTL_MS)
	});
	return id;
}

/** The challenge behind an id, removed as it is read: a challenge can be answered once. */
async function takeChallenge(db: Db, id: string | undefined, kind: 'register' | 'login', userId: string | null, now: number) {
	if (!id) return null;
	const [row] = await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, id)).returning();
	if (!row || row.kind !== kind || row.userId !== userId || row.expiresAt.getTime() <= now) return null;
	return row.challenge;
}

export async function beginRegistration(db: Db, settings: PasskeySettings, user: Pick<User, 'id' | 'email' | 'name'>, now = Date.now()) {
	const existing = await db.select().from(passkeys).where(eq(passkeys.userId, user.id));
	const options = await generateRegistrationOptions({
		rpName: settings.rpName,
		rpID: settings.rpID,
		userName: user.email,
		userDisplayName: user.name,
		userID: new TextEncoder().encode(user.id),
		attestationType: 'none',
		excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: parseTransports(p.transports) })),
		// A discoverable credential, verified by the device (PIN, fingerprint or face), so it can sign in alone.
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
	});
	return { options, challengeId: await saveChallenge(db, { challenge: options.challenge, kind: 'register', userId: user.id }, now) };
}

export type PasskeyResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function finishRegistration(
	db: Db,
	settings: PasskeySettings,
	user: Pick<User, 'id'>,
	input: { challengeId: string | undefined; response: RegistrationResponseJSON; name: string },
	now = Date.now()
): Promise<PasskeyResult> {
	const expectedChallenge = await takeChallenge(db, input.challengeId, 'register', user.id, now);
	if (!expectedChallenge) return { ok: false, error: 'That took too long. Try adding the passkey again.' };
	if ((await listPasskeys(db, user.id)).length >= MAX_PASSKEYS_PER_USER) {
		return { ok: false, error: `You can have up to ${MAX_PASSKEYS_PER_USER} passkeys. Remove one first.` };
	}
	try {
		const verified = await verifyRegistrationResponse({
			response: input.response,
			expectedChallenge,
			expectedOrigin: settings.origin,
			expectedRPID: settings.rpID,
			requireUserVerification: true
		});
		if (!verified.verified) return { ok: false, error: 'The passkey could not be verified.' };
		const { credential } = verified.registrationInfo;
		if (await db.query.passkeys.findFirst({ where: eq(passkeys.credentialId, credential.id) })) {
			return { ok: false, error: 'That passkey is already registered.' };
		}
		await db.insert(passkeys).values({
			userId: user.id,
			credentialId: credential.id,
			publicKey: Buffer.from(credential.publicKey).toString('base64url'),
			counter: credential.counter,
			transports: credential.transports ? JSON.stringify(credential.transports) : null,
			name: input.name
		});
		return { ok: true };
	} catch {
		return { ok: false, error: 'The passkey could not be verified.' };
	}
}

export async function beginLogin(db: Db, settings: PasskeySettings, now = Date.now()) {
	// No list of allowed credentials: the device offers the passkeys it holds for this site.
	const options = await generateAuthenticationOptions({ rpID: settings.rpID, userVerification: 'required' });
	return { options, challengeId: await saveChallenge(db, { challenge: options.challenge, kind: 'login' }, now) };
}

export const PASSKEY_SIGN_IN_FAILED = 'That passkey could not be used to sign in.';

export async function finishLogin(
	db: Db,
	settings: PasskeySettings,
	input: { challengeId: string | undefined; response: AuthenticationResponseJSON },
	now = Date.now()
): Promise<PasskeyResult<{ user: User }>> {
	const failed = { ok: false, error: PASSKEY_SIGN_IN_FAILED } as const;
	const expectedChallenge = await takeChallenge(db, input.challengeId, 'login', null, now);
	if (!expectedChallenge) return failed;
	const passkey = await db.query.passkeys.findFirst({ where: eq(passkeys.credentialId, String(input.response?.id)) });
	if (!passkey) return failed;
	const user = await db.query.users.findFirst({ where: eq(users.id, passkey.userId) });
	if (!user || user.disabledAt) return failed;
	try {
		const verified = await verifyAuthenticationResponse({
			response: input.response,
			expectedChallenge,
			expectedOrigin: settings.origin,
			expectedRPID: settings.rpID,
			requireUserVerification: true,
			credential: {
				id: passkey.credentialId,
				publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
				counter: passkey.counter,
				transports: parseTransports(passkey.transports)
			}
		});
		if (!verified.verified) return failed;
		await db
			.update(passkeys)
			.set({ counter: verified.authenticationInfo.newCounter, lastUsedAt: new Date(now) })
			.where(eq(passkeys.id, passkey.id));
		return { ok: true, user };
	} catch {
		return failed;
	}
}

function parseTransports(value: string | null) {
	try {
		return value ? (JSON.parse(value) as string[]) : undefined;
	} catch {
		return undefined;
	}
}

/** Remembers a ceremony's challenge id in a short-lived cookie (it is only an id; the challenge stays on the server). */
export function setChallengeCookie(cookies: import('@sveltejs/kit').Cookies, challengeId: string, secure: boolean) {
	cookies.set(PASSKEY_COOKIE, challengeId, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'strict',
		maxAge: PASSKEY_CHALLENGE_TTL_MS / 1000
	});
}
