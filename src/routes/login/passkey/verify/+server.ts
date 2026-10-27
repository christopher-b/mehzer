import { error, json } from '@sveltejs/kit';
import { APP_URL } from '$app/env/private';
import { PASSKEY_COOKIE, finishLogin, passkeySettings } from '#lib/server/passkeys.ts';
import { clientIp, startSession } from '#lib/server/signin.ts';
import { isBlocked, recordFailure } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

/** Finishes signing in with a passkey: checks the device's answer and starts a session. */
export const POST: RequestHandler = async ({ request, locals, cookies, url, getClientAddress }) => {
	const settings = passkeySettings(APP_URL);
	if (!settings) error(404, 'Passkeys are not available');
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || typeof body.response !== 'object' || body.response === null) error(400, 'Bad request');

	const ip = clientIp(getClientAddress);
	const keys = ip ? [`ip:${ip}`] : [];
	if (keys.length && (await isBlocked(locals.db, keys))) error(429, 'Too many attempts. Wait a few minutes and try again.');

	const challengeId = cookies.get(PASSKEY_COOKIE);
	cookies.delete(PASSKEY_COOKIE, { path: '/' });
	const result = await finishLogin(locals.db, settings, { challengeId, response: body.response });
	if (!result.ok) {
		if (keys.length) await recordFailure(locals.db, keys, Date.now());
		return json({ ok: false, error: result.error }, { status: 400 });
	}
	await startSession(locals.db, cookies, url, request, result.user.id);
	return json({ ok: true });
};
