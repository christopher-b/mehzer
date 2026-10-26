import { fail } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { emailChangedNotice, sendEmail } from '#lib/server/email.ts';
import { completeEmailChange, findUsableEmailChange } from '#lib/server/emailChange.ts';
import { requireUser } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

// Opening the link only shows what will change; the change itself is a POST, so a mail scanner
// that fetches the link cannot trigger it. The link works only while signed in as that account.
export const load: PageServerLoad = async ({ locals, params }) => {
	const change = await findUsableEmailChange(locals.db, SESSION_SECRET, requireUser(locals).id, params.token);
	return { newEmail: change?.newEmail ?? null };
};

export const actions: Actions = {
	default: async ({ locals, params }) => {
		const user = requireUser(locals);
		const result = await completeEmailChange(locals.db, SESSION_SECRET, user.id, params.token, locals.sessionId ?? undefined);
		if ('error' in result) return fail(400, { error: result.error });
		await sendEmail(emailChangedNotice(result.oldEmail, result.newEmail));
		return { changed: result.newEmail };
	}
};
