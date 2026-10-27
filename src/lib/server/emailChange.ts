import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { hashToken, randomToken } from './auth.ts';
import { emailChanges, sessions, users } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { EMAIL_TAKEN, Rollback, isUniqueViolation, type Tx } from './users.ts';

export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

/** A link token for changing to `newEmail`; this user's older unused ones are cancelled. */
export async function createEmailChange(db: Db, secret: string, userId: string, newEmail: string, now = Date.now()) {
	await db
		.update(emailChanges)
		.set({ usedAt: new Date(now) })
		.where(and(eq(emailChanges.userId, userId), isNull(emailChanges.usedAt)));
	const token = randomToken();
	await db.insert(emailChanges).values({
		userId,
		newEmail,
		tokenHash: await hashToken(secret, token),
		expiresAt: new Date(now + EMAIL_CHANGE_TTL_MS)
	});
	return token;
}

/** The pending change for a link token, if it is not used or expired and belongs to this user. */
export async function findUsableEmailChange(db: Db, secret: string, userId: string, token: string, now = Date.now()) {
	const change = await db.query.emailChanges.findFirst({
		where: and(
			eq(emailChanges.tokenHash, await hashToken(secret, token)),
			eq(emailChanges.userId, userId),
			isNull(emailChanges.usedAt),
			gt(emailChanges.expiresAt, new Date(now))
		)
	});
	return change ?? null;
}

/** The sign-out and update for a new address, inside a transaction; the check and the update stay together. */
function applyEmail(tx: Tx, userId: string, newEmail: string, keepSessionId?: string): { oldEmail: string } | { error: string } {
	const user = tx.select().from(users).where(eq(users.id, userId)).get();
	if (!user) return { error: 'Account not found.' };
	const other = tx.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).get();
	if (other && other.id !== userId) return { error: EMAIL_TAKEN };
	try {
		tx.update(users).set({ email: newEmail }).where(eq(users.id, userId)).run();
	} catch (err) {
		if (isUniqueViolation(err)) return { error: EMAIL_TAKEN };
		throw err;
	}
	tx.delete(sessions)
		.where(keepSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)) : eq(sessions.userId, userId))
		.run();
	return { oldEmail: user.email };
}

/** Changes a user's address. Other devices are signed out (`keepSessionId` stays). Returns the old address. */
export function setEmail(db: Db, userId: string, newEmail: string, keepSessionId?: string): { oldEmail: string } | { error: string } {
	return db.transaction((tx) => applyEmail(tx, userId, newEmail, keepSessionId));
}

export type CompleteEmailChange = { oldEmail: string; newEmail: string } | { error: string };

/** Applies a change from its link (single use). If the address is taken, the link stays usable. */
export async function completeEmailChange(
	db: Db,
	secret: string,
	userId: string,
	token: string,
	keepSessionId?: string,
	now = Date.now()
): Promise<CompleteEmailChange> {
	const invalid = { error: 'This link is no longer valid.' };
	const change = await findUsableEmailChange(db, secret, userId, token, now);
	if (!change) return invalid;
	try {
		return db.transaction((tx) => {
			const claimed = tx
				.update(emailChanges)
				.set({ usedAt: new Date(now) })
				.where(and(eq(emailChanges.id, change.id), isNull(emailChanges.usedAt)))
				.returning({ id: emailChanges.id })
				.all();
			if (claimed.length === 0) throw new Rollback(invalid);
			const result = applyEmail(tx, userId, change.newEmail, keepSessionId);
			if ('error' in result) throw new Rollback(result);
			return { oldEmail: result.oldEmail, newEmail: change.newEmail };
		});
	} catch (err) {
		if (err instanceof Rollback) return err.result;
		throw err;
	}
}
