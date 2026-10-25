/** Which cards are collapsed, by id; remembered per project in this browser (localStorage). */
export class CollapsedState {
	#projectId: () => string;
	#byId = $state<Record<string, boolean>>({});

	constructor(projectId: () => string) {
		this.#projectId = projectId;
	}

	get #key() {
		return `mehzur:collapsed:${this.#projectId()}`;
	}

	/** Reads the saved choice. Call once the page is mounted in the browser. */
	load() {
		try {
			const saved = JSON.parse(localStorage.getItem(this.#key) ?? '{}') as Record<string, unknown>;
			this.#byId = Object.fromEntries(
				Object.entries(saved)
					.filter(([, v]) => v === true)
					.map(([id]) => [id, true])
			);
		} catch {
			// Unreadable or unavailable storage: start expanded.
		}
	}

	has(id: string) {
		return !!this.#byId[id];
	}

	toggle(id: string) {
		this.#byId[id] = !this.#byId[id];
		try {
			localStorage.setItem(this.#key, JSON.stringify(this.#byId));
		} catch {
			// Private mode etc.: the choice just won't be remembered.
		}
	}
}
