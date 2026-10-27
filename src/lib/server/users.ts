import { error } from '@sveltejs/kit';
import { and, count, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { loginAttempts, projects, users, type User, type UserRole } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { hashPassword, passwordProblem, verifyPassword } from './password.ts';
import { deleteProject } from './projects.ts';
import type { BlobStorage } from './storage/types.ts';

export const EMAIL_MAX_LENGTH = 254;

/** The signed-in user as the rest of the app sees them (never includes the password hash). */
export interface SessionUser {
	id: string;
	email: string;
	name: string;
	role: UserRole;
}

export const toSessionUser = (user: User): SessionUser => ({
	id: user.id,
	email: user.email,
	name: user.name,
	role: user.role
});

/** A trimmed, lower-cased address, or null when it does not look like one. */
export function normalizeEmail(value: FormDataEntryValue | string | null | undefined): string | null {
	const email = String(value ?? '').trim().toLowerCase();
	if (!email || email.length > EMAIL_MAX_LENGTH) return null;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function countUsers(db: Db): Promise<number> {
	const [row] = await db.select({ n: count() }).from(users);
	return row.n;
}

export async function findUserByEmail(db: Db, email: string) {
	return db.query.users.findFirst({ where: eq(users.email, email) });
}

export type CreateUserResult = { user: User } | { error: string };

export const EMAIL_TAKEN = 'That email address already has an account.';

/** Thrown inside a transaction to undo it and hand back the reason. */
export class Rollback {
	constructor(readonly result: { error: string }) {}
}

/** The handle a `db.transaction` callback gets; its calls are synchronous (`.get()`, `.all()`, `.run()`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function isUniqueViolation(err: unknown): boolean {
	const e = err as { code?: string; cause?: { code?: string } } | null;
	return e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || e?.cause?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Adds a user inside a transaction. The email check and the insert run together (and a unique
 * violation is caught as well), so two requests for one address cannot both succeed or throw a 500.
 */
export function insertUser(
	tx: Tx,
	input: { email: string; name: string; passwordHash: string; role?: UserRole }
): CreateUserResult {
	if (tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) return { error: EMAIL_TAKEN };
	try {
		const user = tx
			.insert(users)
			.values({ email: input.email, name: input.name, passwordHash: input.passwordHash, role: input.role ?? 'member' })
			.returning()
			.get();
		return { user };
	} catch (err) {
		if (isUniqueViolation(err)) return { error: EMAIL_TAKEN };
		throw err;
	}
}

export async function createUser(
	db: Db,
	input: { email: string; name: string; password: string; role?: UserRole }
): Promise<CreateUserResult> {
	const problem = passwordProblem(input.password);
	if (problem) return { error: problem };
	// Hashing yields to other requests, so it happens before the check and insert, never between them.
	const passwordHash = await hashPassword(input.password);
	return db.transaction((tx) => insertUser(tx, { ...input, passwordHash }));
}

/** Projects from before accounts existed have no owner; the first admin gets them all. */
export function claimOrphanProjects(db: Db | Tx, userId: string) {
	db.update(projects).set({ ownerId: userId, createdBy: userId }).where(isNull(projects.ownerId)).run();
}

export const SETUP_DONE = 'Setup is already done.';

/**
 * Creates the first administrator, and only while there are no accounts: the count is checked in the
 * same transaction as the insert, so two setup requests cannot make two admins. Projects from before
 * accounts existed (no owner) go to the new admin.
 */
export async function createFirstAdmin(
	db: Db,
	input: { email: string; name: string; password: string }
): Promise<CreateUserResult> {
	const problem = passwordProblem(input.password);
	if (problem) return { error: problem };
	const passwordHash = await hashPassword(input.password);
	return db.transaction((tx) => {
		if (tx.select({ n: count() }).from(users).get()!.n > 0) return { error: SETUP_DONE };
		const created = insertUser(tx, { ...input, passwordHash, role: 'admin' });
		if ('user' in created) claimOrphanProjects(tx, created.user.id);
		return created;
	});
}

export async function setPassword(db: Db, userId: string, password: string): Promise<string | null> {
	const problem = passwordProblem(password);
	if (problem) return problem;
	await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
	return null;
}

// ---- guessing limits: failed attempts are kept in the database and counted over a window

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMIT_PER_EMAIL = 5;
export const LOGIN_LIMIT_PER_IP = 50;

const limitFor = (key: string) => (key.startsWith('ip:') ? LOGIN_LIMIT_PER_IP : LOGIN_LIMIT_PER_EMAIL);

export async function isBlocked(db: Db, keys: string[], now = Date.now()): Promise<boolean> {
	for (const key of keys) {
		const [row] = await db
			.select({ n: count() })
			.from(loginAttempts)
			.where(and(eq(loginAttempts.key, key), gt(loginAttempts.at, new Date(now - LOGIN_WINDOW_MS))));
		if (row.n >= limitFor(key)) return true;
	}
	return false;
}

export async function recordFailure(db: Db, keys: string[], now: number) {
	await db.delete(loginAttempts).where(lt(loginAttempts.at, new Date(now - LOGIN_WINDOW_MS)));
	await db.insert(loginAttempts).values(keys.map((key) => ({ key, at: new Date(now) })));
}

export async function clearFailures(db: Db, keys: string[]) {
	await db.delete(loginAttempts).where(inArray(loginAttempts.key, keys));
}

export type AuthResult = { user: User } | { error: 'blocked' | 'invalid' };

let dummyHash: Promise<string> | undefined;

/**
 * Checks an email and password. Failures are counted per address and per client address; once either
 * is over its limit further attempts are refused without checking. An unknown address still costs the
 * same time as a wrong password.
 */
export async function authenticate(
	db: Db,
	input: { email: string; password: string; ip?: string | null },
	now = Date.now()
): Promise<AuthResult> {
	const email = normalizeEmail(input.email);
	const keys = [`email:${email ?? input.email.trim().toLowerCase()}`, ...(input.ip ? [`ip:${input.ip}`] : [])];
	if (await isBlocked(db, keys, now)) return { error: 'blocked' };

	const user = email ? await findUserByEmail(db, email) : undefined;
	dummyHash ??= hashPassword('not-a-real-password');
	const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash));
	if (user && valid && !user.disabledAt) {
		// Only this address's count is cleared: one working account must not reset the per-client limit.
		await clearFailures(db, keys.filter((k) => k.startsWith('email:')));
		return { user };
	}
	await recordFailure(db, keys, now);
	return { error: 'invalid' };
}

/** Deletes a user together with their projects, photos and measurements (and the photo files). */
export async function deleteUserAndContent(db: Db, storage: BlobStorage, userId: string) {
	const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId));
	for (const project of owned) await deleteProject(db, storage, project.id);
	// Sessions and reset links go with the user (cascade); anything else they created stays, with the
	// author cleared (shown as "deleted user").
	await db.delete(users).where(eq(users.id, userId));
}

/** The signed-in user for a route that needs one (hooks already refuse signed-out requests). */
export function requireUser(locals: { user: SessionUser | null }): SessionUser {
	if (!locals.user) error(401, 'Unauthorized');
	return locals.user;
}

export function requireAdmin(locals: { user: SessionUser | null }): SessionUser {
	const user = requireUser(locals);
	if (user.role !== 'admin') error(404, 'Not found');
	return user;
}
