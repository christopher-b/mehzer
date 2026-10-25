import { fail, redirect } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { formString } from '#lib/server/forms.ts';
import { completePasswordReset, findUsableReset } from '#lib/server/invites.ts';
import { deleteUserSessions } from '#lib/server/sessions.ts';
import { startSession } from '#lib/server/signin.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => ({
	valid: (await findUsableReset(locals.db, SESSION_SECRET, params.token)) !== null
});

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, params }) => {
		const form = await request.formData();
		const password = formString(form, 'password');
		if (password !== formString(form, 'confirm')) return fail(400, { error: 'The passwords do not match.' });
		const result = await completePasswordReset(locals.db, SESSION_SECRET, params.token, password);
		if ('error' in result) return fail(400, { error: result.error });
		// Anyone who had this account open elsewhere is signed out; this device signs in fresh.
		await deleteUserSessions(locals.db, result.user.id);
		await startSession(locals.db, cookies, url, request, result.user.id);
		redirect(303, '/');
	}
};
