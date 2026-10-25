import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { SESSION_SECRET } from '$app/env/private';
import { projects, users } from '#lib/server/db/schema.ts';
import { appUrl, emailConfigured, inviteEmail, resetEmail, sendEmail } from '#lib/server/email.ts';
import { formString } from '#lib/server/forms.ts';
import { createInvite, createPasswordReset, listPendingInvites, revokeInvite } from '#lib/server/invites.ts';
import { deleteUserSessions } from '#lib/server/sessions.ts';
import { deleteUserAndContent, normalizeEmail, requireAdmin } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);
	const all = await locals.db.select().from(users).orderBy(users.createdAt);
	const owned = await locals.db.select({ ownerId: projects.ownerId }).from(projects);
	const counts = new Map<string, number>();
	for (const { ownerId } of owned) if (ownerId) counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
	return {
		me: locals.user!.id,
		emailEnabled: emailConfigured(),
		users: all.map((u) => ({
			id: u.id,
			email: u.email,
			name: u.name,
			role: u.role,
			createdAt: u.createdAt,
			disabled: u.disabledAt !== null,
			projectCount: counts.get(u.id) ?? 0
		})),
		invites: (await listPendingInvites(locals.db)).map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt }))
	};
};

const linkBase = (url: URL) => appUrl() || url.origin;

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const raw = formString(form, 'email').trim();
		const email = raw ? normalizeEmail(raw) : null;
		if (raw && !email) return fail(400, { inviteError: 'Enter a valid email address, or leave it empty.' });

		const { token } = await createInvite(locals.db, SESSION_SECRET, { email, createdBy: admin.id });
		const link = `${linkBase(url)}/invite/${token}`;
		const emailed = email && form.get('send') ? await sendEmail(inviteEmail(email, link, admin.name)) : false;
		return { inviteLink: link, inviteEmail: email, emailed };
	},

	revoke: async ({ request, locals }) => {
		requireAdmin(locals);
		await revokeInvite(locals.db, formString(await request.formData(), 'inviteId'));
	},

	resetLink: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const target = await locals.db.query.users.findFirst({
			where: eq(users.id, formString(await request.formData(), 'userId'))
		});
		if (!target) return fail(404, { userError: 'User not found.' });
		const token = await createPasswordReset(locals.db, SESSION_SECRET, target.id);
		const link = `${linkBase(url)}/reset/${token}`;
		const emailed = await sendEmail(resetEmail(target.email, link));
		return { resetLink: link, resetFor: target.email, emailed };
	},

	disable: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const id = formString(await request.formData(), 'userId');
		if (id === admin.id) return fail(400, { userError: 'You cannot disable your own account.' });
		await locals.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, id));
		await deleteUserSessions(locals.db, id);
	},

	enable: async ({ request, locals }) => {
		requireAdmin(locals);
		await locals.db
			.update(users)
			.set({ disabledAt: null })
			.where(eq(users.id, formString(await request.formData(), 'userId')));
	},

	delete: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const id = formString(form, 'userId');
		if (id === admin.id) return fail(400, { userError: 'You cannot delete your own account here.' });
		const target = await locals.db.query.users.findFirst({ where: eq(users.id, id) });
		if (!target) return fail(404, { userError: 'User not found.' });
		if (formString(form, 'confirmEmail').trim().toLowerCase() !== target.email) {
			return fail(400, { userError: 'Type the person\'s email address to confirm deleting them and their projects.' });
		}
		await deleteUserAndContent(locals.db, locals.storage, id);
	}
};
