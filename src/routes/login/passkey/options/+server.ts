import { error, json } from '@sveltejs/kit';
import { APP_URL } from '$app/env/private';
import { beginLogin, passkeySettings, setChallengeCookie } from '#lib/server/passkeys.ts';
import { clientIp } from '#lib/server/signin.ts';
import { isBlocked } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

/** Starts signing in with a passkey (public: nobody is signed in yet). */
export const POST: RequestHandler = async ({ locals, cookies, url, getClientAddress }) => {
	const settings = passkeySettings(APP_URL);
	if (!settings) error(404, 'Passkeys are not available');
	const ip = clientIp(getClientAddress);
	if (ip && (await isBlocked(locals.db, [`ip:${ip}`]))) error(429, 'Too many attempts. Wait a few minutes and try again.');
	const { options, challengeId } = await beginLogin(locals.db, settings);
	setChallengeCookie(cookies, challengeId, url.protocol === 'https:');
	return json(options);
};
