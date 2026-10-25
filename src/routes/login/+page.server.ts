import { APP_PASSWORD, SESSION_SECRET } from '$app/env/private';
import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, createSessionToken, setSessionCookie } from '#lib/server/auth.ts';
import { formString } from '#lib/server/forms.ts';
import type { Actions, PageServerLoad } from './$types';

function safeNext(value: string | null): string {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.authenticated) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = formString(form, 'password');
		const ok = await checkPassword(SESSION_SECRET, APP_PASSWORD, password);
		if (!ok) return fail(400, { error: 'Incorrect password' });

		setSessionCookie(cookies, await createSessionToken(SESSION_SECRET), url.protocol === 'https:');
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
