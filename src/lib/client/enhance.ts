import type { SubmitFunction } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { ActionError, classifyResponse, classifyThrown, messageFor, NETWORK_ERROR_MESSAGE } from './errors.ts';
import { showSessionExpired } from './session.svelte.ts';
import { notify } from './notify.svelte.ts';

export interface SubmitOptions {
	/** Shows a message for a failed request (offline, server error, session...). Default: an error notification. */
	onError?: (message: string, error: ActionError) => void;
	/** Handles a `fail(...)` result (the form's own validation message). Default: SvelteKit's `update()`. */
	onFailure?: (result: { status: number; data?: unknown }) => void;
	/** Runs after a successful `update()`. */
	onSuccess?: () => void;
	/** Runs when the session has expired, before the "Signed out" prompt opens (save a draft here). */
	onSession?: () => void;
	/** Runs first, before any confirmation or request. */
	before?: () => void;
	/** Passed to `update()`. */
	reset?: boolean;
	/** Return false to cancel the submit (delete forms that ask first). */
	confirm?: () => boolean;
}

/**
 * Why an `error` result happened. A request that got no response arrives tagged by `hooks.client.ts`;
 * a response that was not a valid action result has no status of its own.
 */
function classifyErrorResult(result: { status?: number; error?: unknown }): ActionError {
	const err = result.error as { status?: number; message?: string } | undefined;
	if (err?.message === NETWORK_ERROR_MESSAGE) return classifyThrown(new TypeError(err.message));
	if (typeof navigator !== 'undefined' && !navigator.onLine) return new ActionError('offline');
	const status = result.status ?? err?.status;
	return classifyResponse({ status: 200 }, { type: 'error', status, error: result.error }) ?? new ActionError('server');
}

/**
 * A `use:enhance` handler that never lets a failed request replace the page with the error page. Failed
 * requests go to `onError`; `fail(...)` results keep the form's own inline message.
 */
export function submitWith(opts: SubmitOptions = {}): SubmitFunction {
	const report =
		opts.onError ?? ((message: string) => void notify({ kind: 'error', message }));
	return ({ cancel }) => {
		opts.before?.();
		if (opts.confirm && !opts.confirm()) {
			cancel();
			return;
		}
		return async ({ result, update }) => {
			let error: ActionError | null = null;
			if (result.type === 'error') error = classifyErrorResult(result);
			else if (result.type === 'redirect') error = classifyResponse({ status: 200 }, result);
			// Deleted elsewhere: say so, and show what is really there now.
			if (result.type === 'failure' && result.status === 404) {
				error = new ActionError('not-found');
				await invalidateAll().catch(() => {});
			}
			if (error?.kind === 'session') {
				opts.onSession?.();
				showSessionExpired();
				// forms that show errors inline keep their own message too
				if (opts.onError) opts.onError(messageFor(error), error);
				return;
			}
			if (error) {
				report(messageFor(error), error);
				return;
			}
			if (result.type === 'failure' && opts.onFailure) {
				opts.onFailure(result);
				return;
			}
			await update(opts.reset === undefined ? undefined : { reset: opts.reset });
			if (result.type === 'success') opts.onSuccess?.();
		};
	};
}
