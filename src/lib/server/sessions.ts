import { and, eq, ne } from 'drizzle-orm';
import { hashToken, randomToken, SESSION_TTL_MS } from './auth.ts';
import { sessions, users } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { toSessionUser, type SessionUser } from './users.ts';

const TOUCH_AFTER_MS = 10 * 60 * 1000;

/** Starts a session and returns the token to put in the cookie. */
export async function createSession(
	db: Db,
	secret: string,
	userId: string,
	userAgent: string | null,
	now = Date.now()
): Promise<string> {
	const token = randomToken();
	await db.insert(sessions).values({
		userId,
		tokenHash: await hashToken(secret, token),
		userAgent: userAgent?.slice(0, 300) ?? null,
		lastSeenAt: new Date(now),
		expiresAt: new Date(now + SESSION_TTL_MS)
	});
	return token;
}

export interface ActiveSession {
	user: SessionUser;
	sessionId: string;
}

/** The user behind a cookie token, or null when it is unknown, expired, or the user is disabled. */
export async function findSession(
	db: Db,
	secret: string,
	token: string | undefined,
	now = Date.now()
): Promise<ActiveSession | null> {
	if (!token) return null;
	const tokenHash = await hashToken(secret, token);
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.tokenHash, tokenHash));
	if (!row) return null;
	if (row.session.expiresAt.getTime() <= now) {
		await db.delete(sessions).where(eq(sessions.id, row.session.id));
		return null;
	}
	if (row.user.disabledAt) return null;
	if (now - row.session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
		await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, row.session.id));
	}
	return { user: toSessionUser(row.user), sessionId: row.session.id };
}

export async function deleteSession(db: Db, secret: string, token: string | undefined) {
	if (!token) return;
	await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(secret, token)));
}

/** Ends all of a user's sessions, optionally keeping one (the one making the request). */
export async function deleteUserSessions(db: Db, userId: string, exceptSessionId?: string) {
	await db
		.delete(sessions)
		.where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
}
