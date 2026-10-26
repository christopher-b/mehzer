import type { Cookies } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { setSessionCookie } from './auth.ts';
import type { Db } from './db/types.ts';
import { createSession } from './sessions.ts';

/** Starts a session for a user and sets the cookie (Secure only when the request really is https). */
export async function startSession(
	db: Db,
	cookies: Cookies,
	url: URL,
	request: Request,
	userId: string
) {
	const token = await createSession(db, SESSION_SECRET, userId, request.headers.get('user-agent'));
	setSessionCookie(cookies, token, url.protocol === 'https:');
}

export { safeNext } from '#lib/safeNext.ts';

/** The client's address as far as the server can tell (the proxy's, unless ADDRESS_HEADER is set). */
export function clientIp(getClientAddress: () => string): string | null {
	try {
		return getClientAddress();
	} catch {
		return null;
	}
}
