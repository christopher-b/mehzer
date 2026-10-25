import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { clearSessionCookie } from '#lib/server/auth.ts';
import { users } from '#lib/server/db/schema.ts';
import { formString } from '#lib/server/forms.ts';
import { verifyPassword } from '#lib/server/password.ts';
import { deleteUserSessions } from '#lib/server/sessions.ts';
import { deleteUserAndContent, parsePersonName, requireUser, setPassword } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ account: requireUser(locals) });

/** The user's current password must be right before anything sensitive changes. */
async function passwordIsRight(locals: App.Locals, form: FormData): Promise<boolean> {
	const user = requireUser(locals);
	const row = await locals.db.query.users.findFirst({ where: eq(users.id, user.id) });
	return row !== undefined && (await verifyPassword(formString(form, 'current'), row.passwordHash));
}

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const user = requireUser(locals);
		const name = parsePersonName((await request.formData()).get('name'));
		if (!name) return fail(400, { profileError: 'Enter your name.' });
		await locals.db.update(users).set({ name }).where(eq(users.id, user.id));
		return { profileSaved: true };
	},

	password: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		if (!(await passwordIsRight(locals, form))) return fail(400, { passwordError: 'Your current password is not right.' });
		const password = formString(form, 'password');
		if (password !== formString(form, 'confirm')) return fail(400, { passwordError: 'The new passwords do not match.' });
		const problem = await setPassword(locals.db, user.id, password);
		if (problem) return fail(400, { passwordError: problem });
		// Other devices are signed out; this one stays signed in.
		await deleteUserSessions(locals.db, user.id, locals.sessionId ?? undefined);
		return { passwordSaved: true };
	},

	signOutOthers: async ({ locals }) => {
		const user = requireUser(locals);
		await deleteUserSessions(locals.db, user.id, locals.sessionId ?? undefined);
		return { signedOutOthers: true };
	},

	deleteAccount: async ({ request, locals, cookies }) => {
		const user = requireUser(locals);
		if (user.role === 'admin') {
			return fail(400, { deleteError: 'The administrator account cannot be deleted.' });
		}
		const form = await request.formData();
		if (formString(form, 'confirmEmail').trim().toLowerCase() !== user.email) {
			return fail(400, { deleteError: 'Type your email address to confirm.' });
		}
		if (!(await passwordIsRight(locals, form))) return fail(400, { deleteError: 'Your current password is not right.' });
		await deleteUserAndContent(locals.db, locals.storage, user.id);
		clearSessionCookie(cookies);
		redirect(303, '/login');
	}
};
