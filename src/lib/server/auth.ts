import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'mehzur_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	return btoa(String.fromCharCode(...new Uint8Array(sig)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Compare via HMAC digests so the check doesn't leak the password length or prefix. */
export async function checkPassword(secret: string, expected: string, given: string) {
	const [a, b] = await Promise.all([hmac(secret, `pw:${expected}`), hmac(secret, `pw:${given}`)]);
	return timingSafeEqual(a, b);
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
	const exp = String(now + SESSION_TTL_MS);
	return `${exp}.${await hmac(secret, `session:${exp}`)}`;
}

export async function verifySessionToken(
	secret: string,
	token: string | undefined,
	now = Date.now()
): Promise<boolean> {
	if (!token) return false;
	const [exp, sig] = token.split('.');
	if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
	return timingSafeEqual(sig, await hmac(secret, `session:${exp}`));
}

/**
 * `secure` must follow the real protocol: SvelteKit would otherwise mark the cookie Secure on
 * every origin except http://localhost, and browsers drop Secure cookies on plain http (LAN use).
 */
export function setSessionCookie(cookies: Cookies, token: string, secure: boolean) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge: SESSION_TTL_MS / 1000
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
