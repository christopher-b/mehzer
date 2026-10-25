import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '#lib/server/auth.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
