import { error, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { SESSION_SECRET } from '$app/env/private';
import { SESSION_COOKIE } from '#lib/server/auth.ts';
import { findSession } from '#lib/server/sessions.ts';
import { getServices } from '#lib/server/platform.ts';

const PUBLIC_PATHS = new Set([
	'/login',
	'/setup',
	'/forgot',
	'/manifest.webmanifest',
	'/icon.svg',
	'/icon-192.png',
	'/icon-512.png',
	'/apple-touch-icon.png'
]);

// Links from emails: the token in the address is the credential.
const PUBLIC_PREFIXES = ['/invite/', '/reset/'];

export const handle: Handle = async ({ event, resolve }) => {
	const { db, storage } = await getServices();
	event.locals.db = db;
	event.locals.storage = storage;

	const session = await findSession(db, SESSION_SECRET, event.cookies.get(SESSION_COOKIE));
	event.locals.user = session?.user ?? null;
	event.locals.sessionId = session?.sessionId ?? null;

	const path = event.url.pathname;
	if (!event.locals.user && !PUBLIC_PATHS.has(path) && !PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		if (event.url.pathname.startsWith('/api/')) error(401, 'Unauthorized');
		// Scripted action calls (`use:enhance`, `postAction`) get a machine-readable 401 the page can
		// turn into a "Signed out" prompt; following a redirect would hand them the sign-in page.
		if (event.request.headers.get('x-sveltekit-action') === 'true') {
			return Response.json(
				{ type: 'error', status: 401, error: { message: 'Your session has expired' } },
				{ status: 401 }
			);
		}
		// After signing in, return to the page, not to an action address like `?/createRoom`.
		const next = event.url.pathname + (event.url.search.startsWith('?/') ? '' : event.url.search);
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};

export const GENERIC_MESSAGE = 'Something went wrong on our side.';

/**
 * Unexpected errors (a bug, a database failure, any 5xx) get an id, are logged as one JSON line and reach
 * the user as a generic message plus that id. Expected errors (`error(404, ...)`) keep their own message
 * and are not logged as errors. Never throws.
 */
export const handleError: HandleServerError = (input) => {
	try {
		const { kind, error, event } = input;
		const status =
			kind === 'unknown' ? 500 : Number((error as { status?: unknown } | undefined)?.status) || 500;
		if (kind !== 'unknown' && status < 500) return;

		const id = crypto.randomUUID().slice(0, 8);
		const err = error as { message?: unknown; stack?: unknown } | undefined;
		console.error(
			JSON.stringify({
				id,
				status,
				method: event?.request?.method,
				path: event?.url?.pathname,
				route: event?.route?.id,
				message: typeof err?.message === 'string' ? err.message : String(error),
				stack: typeof err?.stack === 'string' ? err.stack : undefined
			})
		);
		return { message: GENERIC_MESSAGE, id };
	} catch {
		return { message: GENERIC_MESSAGE };
	}
};
