import { APP_PASSWORD, SESSION_SECRET } from '$app/env/private';
import { error, fail, redirect } from '@sveltejs/kit';
import { checkPassword } from '#lib/server/auth.ts';
import { formString } from '#lib/server/forms.ts';
import { startSession } from '#lib/server/signin.ts';
import {
	claimOrphanProjects,
	clearFailures,
	countUsers,
	createUser,
	isBlocked,
	normalizeEmail,
	parsePersonName,
	recordFailure
} from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

const KEY = 'setup';

/** Only available while there are no accounts; it creates the admin, using APP_PASSWORD as the key. */
export const load: PageServerLoad = async ({ locals }) => {
	if ((await countUsers(locals.db)) > 0) error(404, 'Not found');
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals }) => {
		if ((await countUsers(locals.db)) > 0) error(404, 'Not found');
		const form = await request.formData();
		const name = formString(form, 'name');
		const email = formString(form, 'email');
		const values = { name, email };

		if (await isBlocked(locals.db, [KEY])) {
			return fail(429, { error: 'Too many failed attempts. Wait a few minutes and try again.', ...values });
		}
		if (!(await checkPassword(SESSION_SECRET, APP_PASSWORD, formString(form, 'setupPassword')))) {
			await recordFailure(locals.db, [KEY], Date.now());
			return fail(400, { error: 'Incorrect setup password', ...values });
		}
		const personName = parsePersonName(name);
		const address = normalizeEmail(email);
		if (!personName) return fail(400, { error: 'Enter your name.', ...values });
		if (!address) return fail(400, { error: 'Enter a valid email address.', ...values });
		const password = formString(form, 'password');
		if (password !== formString(form, 'confirm')) return fail(400, { error: 'The passwords do not match.', ...values });

		const created = await createUser(locals.db, { email: address, name: personName, password, role: 'admin' });
		if ('error' in created) return fail(400, { error: created.error, ...values });

		await clearFailures(locals.db, [KEY]);
		await claimOrphanProjects(locals.db, created.user.id);
		await startSession(locals.db, cookies, url, request, created.user.id);
		redirect(303, '/');
	}
};
