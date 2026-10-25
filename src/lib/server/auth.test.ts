import { describe, expect, it, vi } from 'vitest';
import {
	checkPassword,
	clearSessionCookie,
	hashToken,
	randomToken,
	SESSION_COOKIE,
	setSessionCookie
} from './auth.ts';

const SECRET = 'test-secret-value';

describe('checkPassword', () => {
	it('accepts the right password and rejects others', async () => {
		expect(await checkPassword(SECRET, 'hunter2', 'hunter2')).toBe(true);
		expect(await checkPassword(SECRET, 'hunter2', 'hunter3')).toBe(false);
		expect(await checkPassword(SECRET, 'hunter2', '')).toBe(false);
		expect(await checkPassword(SECRET, 'hunter2', 'hunter2 ')).toBe(false);
		expect(await checkPassword(SECRET, 'hunter2', 'HUNTER2')).toBe(false);
	});
});

describe('tokens', () => {
	it('makes long, URL-safe, different random tokens', () => {
		const a = randomToken();
		const b = randomToken();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('hashes a token with the secret: stable, but different for another token or secret', async () => {
		const hash = await hashToken(SECRET, 'abc');
		expect(await hashToken(SECRET, 'abc')).toBe(hash);
		expect(await hashToken(SECRET, 'abd')).not.toBe(hash);
		expect(await hashToken('other-secret', 'abc')).not.toBe(hash);
		expect(hash).not.toContain('abc');
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
