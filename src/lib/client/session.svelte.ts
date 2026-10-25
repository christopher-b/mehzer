import { ActionError } from './errors.ts';

class SessionPrompt {
	open = $state(false);
}

export const sessionPrompt = new SessionPrompt();

export const showSessionExpired = () => (sessionPrompt.open = true);

/** If `error` means the session expired, open the "Signed out" prompt and return true. */
export function reportSession(error: unknown): boolean {
	if (error instanceof ActionError && error.kind === 'session') {
		showSessionExpired();
		return true;
	}
	return false;
}
