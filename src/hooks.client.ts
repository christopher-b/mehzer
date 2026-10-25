import type { HandleClientError } from '@sveltejs/kit/hooks';
import { NETWORK_ERROR_MESSAGE } from '#lib/client/errors.ts';

const GENERIC_MESSAGE = 'Something went wrong on our side.';

// A rejected `fetch` (no connection) is a TypeError. It is tagged so `submitWith` can tell "no
// connection" from "bad response". Any other unexpected error gets an id the user can quote.
export const handleError: HandleClientError = ({ kind, error }) => {
	try {
		if (kind === 'unknown' && error instanceof TypeError) return { status: 503, message: NETWORK_ERROR_MESSAGE };
		if (kind !== 'unknown') return;
		const id = crypto.randomUUID().slice(0, 8);
		console.error(JSON.stringify({ id, message: (error as Error)?.message, stack: (error as Error)?.stack }));
		return { message: GENERIC_MESSAGE, id };
	} catch {
		return { message: GENERIC_MESSAGE };
	}
};
