import { redirect } from '@sveltejs/kit';
import { SESSION_SECRET } from '$app/env/private';
import { clearSessionCookie, SESSION_COOKIE } from '#lib/server/auth.ts';
import { deleteSession } from '#lib/server/sessions.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	await deleteSession(locals.db, SESSION_SECRET, cookies.get(SESSION_COOKIE));
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
