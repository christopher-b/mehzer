import { and, eq, gt, isNull } from 'drizzle-orm';
import { hashToken, randomToken } from './auth.ts';
import { emailChanges, users } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { deleteUserSessions } from './sessions.ts';
import { EMAIL_TAKEN, findUserByEmail } from './users.ts';

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

/** Changes a user's address. Other devices are signed out (`keepSessionId` stays). Returns the old address. */
export async function setEmail(db: Db, userId: string, newEmail: string, keepSessionId?: string): Promise<{ oldEmail: string } | { error: string }> {
	const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
	if (!user) return { error: 'Account not found.' };
	const other = await findUserByEmail(db, newEmail);
	if (other && other.id !== userId) return { error: EMAIL_TAKEN };
	await db.update(users).set({ email: newEmail }).where(eq(users.id, userId));
	await deleteUserSessions(db, userId, keepSessionId);
	return { oldEmail: user.email };
}

export type CompleteEmailChange = { oldEmail: string; newEmail: string } | { error: string };

/** Applies a change from its link (single use). */
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
	const claimed = await db
		.update(emailChanges)
		.set({ usedAt: new Date(now) })
		.where(and(eq(emailChanges.id, change.id), isNull(emailChanges.usedAt)))
		.returning({ id: emailChanges.id });
	if (claimed.length === 0) return invalid;
	const result = await setEmail(db, userId, change.newEmail, keepSessionId);
	return 'error' in result ? result : { oldEmail: result.oldEmail, newEmail: change.newEmail };
}
