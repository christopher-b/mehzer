import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from './password.ts';

describe('hashPassword / verifyPassword', () => {
	it('verifies the right password and rejects others', async () => {
		const hash = await hashPassword('correct horse battery', 1000);
		expect(await verifyPassword('correct horse battery', hash)).toBe(true);
		expect(await verifyPassword('correct horse batterz', hash)).toBe(false);
		expect(await verifyPassword('', hash)).toBe(false);
		expect(await verifyPassword('correct horse battery ', hash)).toBe(false);
	});

	it('stores a versioned string with a random salt, never the password', async () => {
		const a = await hashPassword('same password here', 1000);
		const b = await hashPassword('same password here', 1000);
		expect(a).not.toBe(b);
		expect(a).toMatch(/^pbkdf2-sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
		expect(a).not.toContain('same password');
	});

	it('keeps checking old hashes after the cost is raised', async () => {
		const old = await hashPassword('old password value', 1000);
		const current = await hashPassword('old password value', 2000);
		expect(await verifyPassword('old password value', old)).toBe(true);
		expect(await verifyPassword('old password value', current)).toBe(true);
	});

	it.each(['', 'plain', 'pbkdf2-sha256$x', 'bcrypt$10$a$b', 'pbkdf2-sha256$1000$AAAA$'])(
		'rejects a malformed stored value %j',
		async (stored) => {
			expect(await verifyPassword('anything at all', stored)).toBe(false);
		}
	);
});

describe('passwordProblem', () => {
	it('accepts a password of a sensible length', () => {
		expect(passwordProblem('x'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
		expect(passwordProblem('x'.repeat(PASSWORD_MAX_LENGTH))).toBeNull();
	});
	it('explains a too short or too long one', () => {
		expect(passwordProblem('x'.repeat(PASSWORD_MIN_LENGTH - 1))).toContain(`${PASSWORD_MIN_LENGTH}`);
		expect(passwordProblem('x'.repeat(PASSWORD_MAX_LENGTH + 1))).toContain(`${PASSWORD_MAX_LENGTH}`);
	});
});
