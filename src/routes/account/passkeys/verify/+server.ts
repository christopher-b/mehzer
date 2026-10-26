import { error, json } from '@sveltejs/kit';
import { APP_URL } from '$app/env/private';
import { PASSKEY_COOKIE, finishRegistration, parsePasskeyName, passkeySettings } from '#lib/server/passkeys.ts';
import { requireUser } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

/** Finishes adding a passkey: checks the device's answer to the challenge and saves the passkey. */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const user = requireUser(locals);
	const settings = passkeySettings(APP_URL);
	if (!settings) error(404, 'Passkeys are not available');
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || typeof body.response !== 'object' || body.response === null) error(400, 'Bad request');
	const challengeId = cookies.get(PASSKEY_COOKIE);
	cookies.delete(PASSKEY_COOKIE, { path: '/' });
	const result = await finishRegistration(locals.db, settings, user, {
		challengeId,
		response: body.response,
		name: parsePasskeyName(body.name)
	});
	return json(result.ok ? { ok: true } : { ok: false, error: result.error }, { status: result.ok ? 200 : 400 });
};
