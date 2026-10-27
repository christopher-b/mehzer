import type { HandleClientError } from '@sveltejs/kit/hooks';
import { NETWORK_ERROR_MESSAGE } from '#lib/client/errors.ts';
import { GENERIC_MESSAGE } from '#lib/constants.ts';

/** What a failed `fetch` looks like: Chrome "Failed to fetch", Firefox "NetworkError...", Safari "Load failed". */
const FETCH_FAILURE = /fetch|network|load failed/i;

// A request that got no response is tagged `code: 'network'` so `submitWith` can tell "no connection"
// from "bad response". Any other unexpected error, TypeErrors included, gets an id the user can quote.
export const handleError: HandleClientError = ({ kind, error }) => {
	try {
		if (kind !== 'unknown') return;
		const message = (error as Error)?.message ?? '';
		if (error instanceof TypeError && (!navigator.onLine || FETCH_FAILURE.test(message))) {
			return { status: 503, message: NETWORK_ERROR_MESSAGE, code: 'network' };
		}
		const id = crypto.randomUUID().slice(0, 8);
		console.error(JSON.stringify({ id, message, stack: (error as Error)?.stack }));
		return { message: GENERIC_MESSAGE, id };
	} catch {
		return { message: GENERIC_MESSAGE };
	}
};
