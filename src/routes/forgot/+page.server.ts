import { fail } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { appUrl, emailConfigured, resetEmail, sendEmail } from '#lib/server/email.ts';
import { formString } from '#lib/server/forms.ts';
import { createPasswordReset } from '#lib/server/invites.ts';
import { findUserByEmail, isBlocked, normalizeEmail, recordFailure } from '#lib/server/users.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const email = formString(form, 'email');
		const address = normalizeEmail(email);
		if (!address) return fail(400, { error: 'Enter your email address.', email });
		if (!emailConfigured()) return { unavailable: true, email };

		// Every request counts, so the form cannot be used to flood someone with emails.
		const key = `forgot:${address}`;
		if (await isBlocked(locals.db, [key])) {
			return fail(429, { error: 'Too many requests. Wait a few minutes and try again.', email });
		}
		await recordFailure(locals.db, [key], Date.now());

		const user = await findUserByEmail(locals.db, address);
		if (user && !user.disabledAt) {
			const token = await createPasswordReset(locals.db, SESSION_SECRET, user.id);
			// Not awaited: waiting for the mail server would show which addresses have accounts. `sendEmail` logs its own failures.
			void sendEmail(resetEmail(user.email, `${appUrl()}/reset/${token}`));
		}
		// The same answer whether or not the address has an account.
		return { sent: true, email };
	}
};
