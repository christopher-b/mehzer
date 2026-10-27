export type NotificationKind = 'success' | 'error' | 'info';

export interface Notification {
	id: number;
	kind: NotificationKind;
	message: string;
	action?: { label: string; run: () => void };
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

class Notifications {
	items = $state<Notification[]>([]);
	#nextId = 1;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	/** Show a notification and return its id. Success and info disappear on their own; errors stay. */
	notify(n: Omit<Notification, 'id'>): number {
		const id = this.#nextId++;
		this.items.push({ ...n, id });
		// Make room by dropping the oldest that can go: an error stays until it is dismissed.
		while (this.items.length > MAX_VISIBLE) this.dismiss((this.items.find((i) => i.kind !== 'error') ?? this.items[0]).id);
		this.resume(id);
		return id;
	}

	/** Stop a notification's countdown while it is hovered or focused. */
	pause(id: number) {
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);
	}

	/** Start the countdown again, from the full time. Errors have none. */
	resume(id: number) {
		const n = this.items.find((i) => i.id === id);
		if (!n || n.kind === 'error') return;
		clearTimeout(this.#timers.get(id));
		this.#timers.set(id, setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS));
	}

	dismiss(id: number) {
		clearTimeout(this.#timers.get(id));
		this.#timers.delete(id);
		this.items = this.items.filter((n) => n.id !== id);
	}
}

export const notifications = new Notifications();
export const notify = (n: Omit<Notification, 'id'>) => notifications.notify(n);
export const dismiss = (id: number) => notifications.dismiss(id);
