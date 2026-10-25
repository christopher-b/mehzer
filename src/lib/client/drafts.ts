/** Input kept in this browser tab across signing in again, so an expired session never loses typed work. */
export type Draft =
	| { kind: 'room'; name: string }
	| { kind: 'measurement'; mode: 'create'; line: { x1: number; y1: number; x2: number; y2: number }; name: string; value: string }
	| { kind: 'measurement'; mode: 'edit'; id: string; name: string; value: string };

const key = () => `mehzur:draft:${location.pathname}`;

export function saveDraft(draft: Draft) {
	try {
		sessionStorage.setItem(key(), JSON.stringify(draft));
	} catch {
		// Storage unavailable: the user retypes.
	}
}

/** The draft saved for this page, removed from storage; null if there is none. */
export function takeDraft(): Draft | null {
	try {
		const raw = sessionStorage.getItem(key());
		if (raw === null) return null;
		sessionStorage.removeItem(key());
		return JSON.parse(raw) as Draft;
	} catch {
		return null;
	}
}
