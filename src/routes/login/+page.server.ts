import { fail, redirect } from '@sveltejs/kit';
import { APP_URL } from '$app/env/private';
import { formString } from '#lib/server/forms.ts';
import { passkeySettings } from '#lib/server/passkeys.ts';
import { clientIp, safeNext, startSession } from '#lib/server/signin.ts';
import { authenticate, countUsers } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	// Before the first account exists there is nothing to sign in to: go and create the admin.
	if ((await countUsers(locals.db)) === 0) redirect(303, '/setup');
	return { passkeys: passkeySettings(APP_URL) !== null };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, getClientAddress }) => {
		const form = await request.formData();
		const email = formString(form, 'email');
		const result = await authenticate(locals.db, {
			email,
			password: formString(form, 'password'),
			ip: clientIp(getClientAddress)
		});
		if ('error' in result) {
			return result.error === 'blocked'
				? fail(429, { error: 'Too many failed attempts. Wait a few minutes and try again.', email })
				: fail(400, { error: 'Incorrect email or password', email });
		}
		await startSession(locals.db, cookies, url, request, result.user.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
