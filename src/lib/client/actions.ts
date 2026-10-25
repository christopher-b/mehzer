import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { classifyResponse, classifyThrown } from './errors.ts';

/**
 * Post to a form action of the current page (`?/name`) and reload the page data on success. Throws an
 * `ActionError` unless the server said it worked, so a caller never mistakes a failure for success.
 */
export async function postAction(action: string, fields: Record<string, string | number | null>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value === null ? '' : String(value));
	let res: Response;
	let text: string;
	try {
		res = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		text = await res.text();
	} catch (err) {
		throw classifyThrown(err);
	}

	let result: ReturnType<typeof deserialize> | undefined;
	try {
		result = deserialize(text);
	} catch {
		result = undefined;
	}

	const error = classifyResponse(res, result);
	if (error) {
		// Someone deleted the item elsewhere: show what is really there now.
		if (error.kind === 'not-found') await invalidateAll();
		throw error;
	}
	if (result?.type === 'redirect') {
		await goto(result.location, { invalidateAll: true });
		return undefined;
	}
	await invalidateAll();
	return (result as { data?: Record<string, unknown> }).data;
}

/** The `error` text of a failed form action result, or the fallback. */
export function failureMessage(result: { data?: unknown }, fallback: string): string {
	return String((result.data as { error?: string } | undefined)?.error ?? fallback);
}
