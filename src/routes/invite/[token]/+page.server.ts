import { fail, redirect } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { formString } from '#lib/server/forms.ts';
import { acceptInvite, findUsableInvite } from '#lib/server/invites.ts';
import { startSession } from '#lib/server/signin.ts';
import { normalizeEmail, parsePersonName } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const invite = await findUsableInvite(locals.db, SESSION_SECRET, params.token);
	return { valid: invite !== null, email: invite?.email ?? null };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, params }) => {
		const form = await request.formData();
		const name = formString(form, 'name');
		const email = formString(form, 'email');
		const values = { name, email };
		const invite = await findUsableInvite(locals.db, SESSION_SECRET, params.token);
		if (!invite) return fail(400, { error: 'This invite link is no longer valid.', ...values });

		const personName = parsePersonName(name);
		const address = normalizeEmail(invite.email ?? email);
		if (!personName) return fail(400, { error: 'Enter your name.', ...values });
		if (!address) return fail(400, { error: 'Enter a valid email address.', ...values });
		const password = formString(form, 'password');
		if (password !== formString(form, 'confirm')) return fail(400, { error: 'The passwords do not match.', ...values });

		const result = await acceptInvite(locals.db, SESSION_SECRET, params.token, { email: address, name: personName, password });
		if ('error' in result) return fail(400, { error: result.error, ...values });
		await startSession(locals.db, cookies, url, request, result.user.id);
		redirect(303, '/');
	}
};
