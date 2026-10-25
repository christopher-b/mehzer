import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismiss, notifications, notify } from './notify.svelte.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	for (const n of [...notifications.items]) dismiss(n.id);
	vi.useRealTimers();
});

describe('notify', () => {
	it('adds a notification and returns an id that dismisses it', () => {
		const id = notify({ kind: 'error', message: 'Oops' });
		expect(notifications.items.map((n) => n.message)).toEqual(['Oops']);
		dismiss(id);
		expect(notifications.items).toEqual([]);
	});

	it('removes success and info after 4 seconds, but keeps errors', () => {
		notify({ kind: 'success', message: 'Saved' });
		notify({ kind: 'info', message: 'FYI' });
		notify({ kind: 'error', message: 'Bad' });
		vi.advanceTimersByTime(3999);
		expect(notifications.items).toHaveLength(3);
		vi.advanceTimersByTime(2);
		expect(notifications.items.map((n) => n.message)).toEqual(['Bad']);
	});

	it('shows at most three, dropping the oldest', () => {
		for (const m of ['a', 'b', 'c', 'd']) notify({ kind: 'error', message: m });
		expect(notifications.items.map((n) => n.message)).toEqual(['b', 'c', 'd']);
	});

	it('keeps the action', () => {
		const run = vi.fn();
		notify({ kind: 'error', message: 'x', action: { label: 'Retry', run } });
		notifications.items[0].action!.run();
		expect(run).toHaveBeenCalled();
	});
});
