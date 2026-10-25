import { describe, expect, it, vi } from 'vitest';
import {
	checkPassword,
	clearSessionCookie,
	createSessionToken,
	SESSION_COOKIE,
	setSessionCookie,
	verifySessionToken
} from './auth.ts';

const SECRET = 'test-secret-value';
const DAY = 24 * 60 * 60 * 1000;

describe('checkPassword', () => {
	it('accepts the right password and rejects others', async () => {
		expect(await checkPassword(SECRET, 'hunter2', 'hunter2')).toBe(true);
		expect(await checkPassword(SECRET, 'hunter2', 'hunter3')).toBe(false);
		expect(await checkPassword(SECRET, 'hunter2', '')).toBe(false);
		expect(await checkPassword(SECRET, 'hunter2', 'hunter2 ')).toBe(false);
		expect(await checkPassword(SECRET, 'hunter2', 'HUNTER2')).toBe(false);
	});
});

describe('session tokens', () => {
	const now = 1_700_000_000_000;

	it('round-trips a valid token', async () => {
		const token = await createSessionToken(SECRET, now);
		expect(await verifySessionToken(SECRET, token, now + 1000)).toBe(true);
	});

	it('is valid for 30 days and not after', async () => {
		const token = await createSessionToken(SECRET, now);
		expect(await verifySessionToken(SECRET, token, now + 30 * DAY - 1)).toBe(true);
		expect(await verifySessionToken(SECRET, token, now + 30 * DAY + 1)).toBe(false);
	});

	it('rejects a token signed with another secret', async () => {
		const token = await createSessionToken('other-secret', now);
		expect(await verifySessionToken(SECRET, token, now)).toBe(false);
	});

	it('rejects a tampered signature or expiry', async () => {
		const token = await createSessionToken(SECRET, now);
		const [exp, sig] = token.split('.');
		expect(await verifySessionToken(SECRET, `${exp}.${sig.slice(0, -2)}AA`, now)).toBe(false);
		// Extending the expiry must invalidate the signature.
		expect(await verifySessionToken(SECRET, `${Number(exp) + DAY}.${sig}`, now)).toBe(false);
	});

	it.each([undefined, '', 'garbage', '.', 'abc.def', '123.', '.abc', '-5.sig', '1e9.sig'])(
		'rejects malformed token %j',
		async (token) => {
			expect(await verifySessionToken(SECRET, token, now)).toBe(false);
		}
	);

	it('produces different tokens at different times', async () => {
		expect(await createSessionToken(SECRET, now)).not.toBe(await createSessionToken(SECRET, now + 1));
	});
});

describe('session cookie helpers', () => {
	it.each([true, false])('sets an httpOnly, lax, site-wide 30-day cookie (secure=%s)', (secure) => {
		const cookies = { set: vi.fn(), delete: vi.fn() };
		setSessionCookie(cookies as never, 'tok', secure);
		expect(cookies.set).toHaveBeenCalledWith(SESSION_COOKIE, 'tok', {
			path: '/',
			httpOnly: true,
			secure,
			sameSite: 'lax',
			maxAge: 30 * 24 * 60 * 60
		});
	});

	it('clears the cookie on the same path', () => {
		const cookies = { set: vi.fn(), delete: vi.fn() };
		clearSessionCookie(cookies as never);
		expect(cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
	});
});
