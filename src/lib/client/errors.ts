export type ErrorKind = 'offline' | 'network' | 'session' | 'not-found' | 'server' | 'validation';

export const MESSAGES: Record<Exclude<ErrorKind, 'validation'>, string> = {
	offline: "You're offline. Check your connection and try again.",
	network: "Couldn't reach the server. Check your connection and try again.",
	session: 'Your session has expired. Sign in again to continue.',
	'not-found': 'That item no longer exists. It may have been deleted.',
	server: 'Something went wrong on our side. Try again in a moment.'
};

/** The message `hooks.client.ts` gives errors caused by a request that got no response. */
export const NETWORK_ERROR_MESSAGE = 'Network error';

/** A failed request, classified so the UI can show the right plain-English message. */
export class ActionError extends Error {
	kind: ErrorKind;
	/** Error id the server logged, for the user to quote. */
	id?: string;

	constructor(kind: ErrorKind, message?: string, id?: string) {
		super(message ?? (kind === 'validation' ? '' : MESSAGES[kind]));
		this.name = 'ActionError';
		this.kind = kind;
		this.id = id;
	}
}

/** The text to show the user for an error. Never exposes technical details. */
export function messageFor(error: unknown): string {
	const e = error instanceof ActionError ? error : classifyThrown(error);
	if (e.kind === 'validation') return e.message;
	if (e.kind === 'server' && e.id) return `${MESSAGES.server} (Error id: ${e.id})`;
	return MESSAGES[e.kind];
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Classify something thrown while sending a request. A fetch that gets no response rejects with a
 * `TypeError` (or an abort); anything else, such as a body that is not JSON, is the server's fault.
 */
export function classifyThrown(error: unknown): ActionError {
	if (error instanceof ActionError) return error;
	if (!(error instanceof TypeError || error instanceof DOMException)) return new ActionError('server');
	return new ActionError(isOffline() ? 'offline' : 'network');
}

/** The kind for an HTTP status (or an `error` result status). */
export function kindForStatus(status: number | undefined): ErrorKind {
	if (status === 401) return 'session';
	if (status === 404) return 'not-found';
	return 'server';
}

/** The parts of a deserialized SvelteKit action result that matter here. */
export interface ActionResultLike {
	type: string;
	status?: number;
	data?: unknown;
	error?: unknown;
	location?: string;
}

const RESULT_TYPES = ['success', 'failure', 'redirect', 'error'];

/**
 * Decide whether an action response was a failure. Returns `null` when the server said success (or
 * asked for a redirect to somewhere other than the sign-in page). `result` is the deserialized body, or
 * `undefined` when the body was not a SvelteKit action result.
 */
export function classifyResponse(
	res: { status: number; redirected?: boolean; url?: string },
	result: ActionResultLike | undefined
): ActionError | null {
	if (res.status === 401) return new ActionError('session');
	if (res.redirected && res.url && pathnameOf(res.url) === '/login') return new ActionError('session');
	if (!result || !RESULT_TYPES.includes(result.type)) return new ActionError('server');
	switch (result.type) {
		case 'success':
			return null;
		case 'redirect':
			return result.location && pathnameOf(result.location) === '/login' ? new ActionError('session') : null;
		case 'failure': {
			if (result.status === 404) return new ActionError('not-found');
			const text = (result.data as { error?: unknown } | undefined)?.error;
			return new ActionError('validation', typeof text === 'string' ? text : 'Request failed');
		}
		default: {
			const status = result.status ?? res.status;
			const err = result.error as { id?: unknown } | undefined;
			const id = typeof err?.id === 'string' ? err.id : undefined;
			return new ActionError(kindForStatus(status), undefined, id);
		}
	}
}

function pathnameOf(url: string): string {
	try {
		return new URL(url, 'http://localhost').pathname;
	} catch {
		return '';
	}
}
