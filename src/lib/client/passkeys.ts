import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

export { browserSupportsWebAuthn };

export type PasskeyOutcome = { ok: true } | { ok: false; error: string };

const CANCELLED = 'Cancelled. Nothing was changed.';

async function post(url: string, body?: unknown): Promise<Response> {
	return fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

async function failure(res: Response, fallback: string): Promise<string> {
	try {
		const data = await res.json();
		return data.error ?? data.message ?? fallback;
	} catch {
		return fallback;
	}
}

/** The browser raises these when the person closes the prompt or it times out. */
const cancelled = (err: unknown) => err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');

/** Adds a passkey to the signed-in account. */
export async function addPasskey(name: string): Promise<PasskeyOutcome> {
	try {
		const options = await post('/account/passkeys/options');
		if (!options.ok) return { ok: false, error: await failure(options, 'Passkeys are not available.') };
		const response = await startRegistration({ optionsJSON: await options.json() });
		const verified = await post('/account/passkeys/verify', { response, name });
		return verified.ok ? { ok: true } : { ok: false, error: await failure(verified, 'The passkey could not be saved.') };
	} catch (err) {
		if (cancelled(err)) return { ok: false, error: CANCELLED };
		if (err instanceof Error && err.name === 'InvalidStateError') return { ok: false, error: 'This device already has a passkey for your account.' };
		return { ok: false, error: 'The passkey could not be added.' };
	}
}

/** Signs in with a passkey the device offers; on success the session cookie is set. */
export async function signInWithPasskey(): Promise<PasskeyOutcome> {
	try {
		const options = await post('/login/passkey/options');
		if (!options.ok) return { ok: false, error: await failure(options, 'Passkeys are not available.') };
		const response = await startAuthentication({ optionsJSON: await options.json() });
		const verified = await post('/login/passkey/verify', { response });
		return verified.ok ? { ok: true } : { ok: false, error: await failure(verified, 'That passkey could not be used to sign in.') };
	} catch (err) {
		if (cancelled(err)) return { ok: false, error: CANCELLED };
		return { ok: false, error: 'Signing in with a passkey did not work.' };
	}
}
