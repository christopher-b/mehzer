/**
 * Password hashing with PBKDF2-SHA256 through Web Crypto: it needs no native module, so the same code
 * runs on Node and on Cloudflare Workers. The hash is stored as
 * `pbkdf2-sha256$<iterations>$<salt>$<hash>` (base64), so the cost can be raised later and old
 * hashes keep working.
 */
import { PASSWORD_MIN_LENGTH } from '#lib/constants.ts';

export { PASSWORD_MIN_LENGTH };
export const PASSWORD_MAX_LENGTH = 200;
// Unit tests run with a small cost so they stay fast; real runs use the full one.
export const DEFAULT_ITERATIONS = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 1_000 : 600_000;

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derive(password, salt, iterations);
	return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, iterations, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !hash) return false;
	const expected = fromBase64(hash);
	const actual = await derive(password, fromBase64(salt) as Uint8Array<ArrayBuffer>, Number(iterations));
	if (actual.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}

/** A message for a password that is not acceptable, or null when it is fine. */
export function passwordProblem(password: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
	if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
	return null;
}
