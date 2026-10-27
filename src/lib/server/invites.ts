import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { hashToken, randomToken } from './auth.ts';
import { invites, passwordResets, users, type User } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { passwordProblem } from './password.ts';
import { hashPassword } from './password.ts';
import { Rollback, insertUser, setPassword } from './users.ts';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Creates an invite. The raw token is returned once (it goes in the link); only its hash is stored. */
export async function createInvite(
	db: Db,
	secret: string,
	input: { email: string | null; createdBy: string },
	now = Date.now()
) {
	const token = randomToken();
	const [invite] = await db
		.insert(invites)
		.values({
			tokenHash: await hashToken(secret, token),
			email: input.email,
			createdBy: input.createdBy,
			expiresAt: new Date(now + INVITE_TTL_MS)
		})
		.returning();
	return { token, invite };
}

/** The invite for a link token if it can still be used (not used, revoked or expired). */
export async function findUsableInvite(db: Db, secret: string, token: string, now = Date.now()) {
	const invite = await db.query.invites.findFirst({
		where: and(
			eq(invites.tokenHash, await hashToken(secret, token)),
			isNull(invites.usedAt),
			isNull(invites.revokedAt),
			gt(invites.expiresAt, new Date(now))
		)
	});
	return invite ?? null;
}

export type AcceptResult = { user: User } | { error: string };

/**
 * Turns an invite into an account. Claiming the invite and creating the user happen in one
 * transaction, so a failure (the address is taken, say) leaves the invite usable and a used invite
 * always has an account.
 */
export async function acceptInvite(
	db: Db,
	secret: string,
	token: string,
	input: { email: string; name: string; password: string },
	now = Date.now()
): Promise<AcceptResult> {
	const invite = await findUsableInvite(db, secret, token, now);
	if (!invite) return { error: 'This invite link is no longer valid.' };
	if (invite.email && invite.email !== input.email) return { error: 'This invite is for a different email address.' };
	const problem = passwordProblem(input.password);
	if (problem) return { error: problem };
	// Hashing yields to other requests, so it happens before the transaction, never inside it.
	const passwordHash = await hashPassword(input.password);

	try {
		return db.transaction((tx) => {
			const claimed = tx
				.update(invites)
				.set({ usedAt: new Date(now) })
				.where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
				.returning({ id: invites.id })
				.all();
			if (claimed.length === 0) throw new Rollback({ error: 'This invite link is no longer valid.' });
			const created = insertUser(tx, { email: input.email, name: input.name, passwordHash, role: 'member' });
			if ('error' in created) throw new Rollback(created);
			tx.update(invites).set({ usedBy: created.user.id }).where(eq(invites.id, invite.id)).run();
			return created;
		});
	} catch (err) {
		if (err instanceof Rollback) return err.result;
		throw err;
	}
}

export async function revokeInvite(db: Db, id: string, now = Date.now()) {
	await db
		.update(invites)
		.set({ revokedAt: new Date(now) })
		.where(and(eq(invites.id, id), isNull(invites.usedAt), isNull(invites.revokedAt)));
}

/** Unused invites that have not expired or been revoked, newest first. */
export async function listPendingInvites(db: Db, now = Date.now()) {
	return db
		.select()
		.from(invites)
		.where(and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date(now))))
		.orderBy(desc(invites.createdAt));
}

/** A reset link token for a user; older unused ones are cancelled. */
export async function createPasswordReset(db: Db, secret: string, userId: string, now = Date.now()) {
	await db
		.update(passwordResets)
		.set({ usedAt: new Date(now) })
		.where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
	const token = randomToken();
	await db.insert(passwordResets).values({
		userId,
		tokenHash: await hashToken(secret, token),
		expiresAt: new Date(now + RESET_TTL_MS)
	});
	return token;
}

export async function findUsableReset(db: Db, secret: string, token: string, now = Date.now()) {
	const reset = await db.query.passwordResets.findFirst({
		where: and(
			eq(passwordResets.tokenHash, await hashToken(secret, token)),
			isNull(passwordResets.usedAt),
			gt(passwordResets.expiresAt, new Date(now))
		)
	});
	return reset ?? null;
}

export type ResetResult = { user: User } | { error: string };

/** Sets a new password from a reset link (single use). */
export async function completePasswordReset(
	db: Db,
	secret: string,
	token: string,
	password: string,
	now = Date.now()
): Promise<ResetResult> {
	const reset = await findUsableReset(db, secret, token, now);
	if (!reset) return { error: 'This reset link is no longer valid.' };
	const user = await db.query.users.findFirst({ where: eq(users.id, reset.userId) });
	if (!user || user.disabledAt) return { error: 'This reset link is no longer valid.' };
	const problem = passwordProblem(password);
	if (problem) return { error: problem };
	const claimed = await db
		.update(passwordResets)
		.set({ usedAt: new Date(now) })
		.where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
		.returning({ id: passwordResets.id });
	if (claimed.length === 0) return { error: 'This reset link is no longer valid.' };
	await setPassword(db, user.id, password);
	return { user };
}
