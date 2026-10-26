import { error, json } from '@sveltejs/kit';
import { APP_URL } from '$app/env/private';
import { beginRegistration, passkeySettings, setChallengeCookie } from '#lib/server/passkeys.ts';
import { requireUser } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

/** Starts adding a passkey to the signed-in account. */
export const POST: RequestHandler = async ({ locals, cookies, url }) => {
	const user = requireUser(locals);
	const settings = passkeySettings(APP_URL);
	if (!settings) error(404, 'Passkeys are not available');
	const { options, challengeId } = await beginRegistration(locals.db, settings, user);
	setChallengeCookie(cookies, challengeId, url.protocol === 'https:');
	return json(options);
};
