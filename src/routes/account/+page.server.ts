import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { clearSessionCookie } from '#lib/server/auth.ts';
import { APP_URL, SESSION_SECRET } from '$app/env/private';
import { users } from '#lib/server/db/schema.ts';
import { appUrl, emailChangeEmail, emailConfigured, sendEmail } from '#lib/server/email.ts';
import { createEmailChange, setEmail } from '#lib/server/emailChange.ts';
import { formString } from '#lib/server/forms.ts';
import { listPasskeys, parsePasskeyName, passkeySettings, removePasskey, renamePasskey } from '#lib/server/passkeys.ts';
import { verifyPassword } from '#lib/server/password.ts';
import { deleteUserSessions } from '#lib/server/sessions.ts';
import {
	deleteUserAndContent,
	EMAIL_TAKEN,
	findUserByEmail,
	isBlocked,
	normalizeEmail,
	parsePersonName,
	recordFailure,
	requireUser,
	setPassword
} from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	account: requireUser(locals),
	// Passkeys need the public https address (`APP_URL`); without it the section is not shown.
	passkeysAvailable: passkeySettings(APP_URL) !== null,
	passkeys: await listPasskeys(locals.db, requireUser(locals).id),
	// With email set up, a new address is confirmed by a link sent to it; without, it changes at once.
	emailConfirmation: emailConfigured()
});

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

	email: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const address = normalizeEmail(form.get('email'));
		if (!address) return fail(400, { emailError: 'Enter a valid email address.' });
		if (address === user.email) return fail(400, { emailError: 'That is already your email address.' });
		if (!(await passwordIsRight(locals, form))) return fail(400, { emailError: 'Your current password is not right.' });
		if (await findUserByEmail(locals.db, address)) return fail(400, { emailError: EMAIL_TAKEN });

		if (!emailConfigured()) {
			const result = await setEmail(locals.db, user.id, address, locals.sessionId ?? undefined);
			if ('error' in result) return fail(400, { emailError: result.error });
			return { emailChanged: address };
		}

		const key = `email-change:${user.id}`;
		if (await isBlocked(locals.db, [key])) {
			return fail(429, { emailError: 'Too many requests. Wait a few minutes and try again.' });
		}
		await recordFailure(locals.db, [key], Date.now());
		const token = await createEmailChange(locals.db, SESSION_SECRET, user.id, address);
		const sent = await sendEmail(emailChangeEmail(address, `${appUrl()}/account/email/${token}`));
		if (!sent) return fail(500, { emailError: 'The email could not be sent. Check the address and try again.' });
		return { emailSentTo: address };
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

	renamePasskey: async ({ request, locals }) => {
		const form = await request.formData();
		const done = await renamePasskey(locals.db, requireUser(locals).id, formString(form, 'id'), parsePasskeyName(form.get('name')));
		if (!done) return fail(404, { passkeyError: 'That passkey was not found.' });
		return { passkeySaved: true };
	},

	removePasskey: async ({ request, locals }) => {
		const done = await removePasskey(locals.db, requireUser(locals).id, formString(await request.formData(), 'id'));
		if (!done) return fail(404, { passkeyError: 'That passkey was not found.' });
		return { passkeyRemoved: true };
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
