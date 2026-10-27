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

	it('keeps a notification while it is hovered or focused, and counts down again afterwards', () => {
		const id = notify({ kind: 'success', message: 'Saved' });
		vi.advanceTimersByTime(3000);
		notifications.pause(id);
		vi.advanceTimersByTime(60_000);
		expect(notifications.items).toHaveLength(1);
		notifications.resume(id);
		vi.advanceTimersByTime(3999);
		expect(notifications.items).toHaveLength(1);
		vi.advanceTimersByTime(2);
		expect(notifications.items).toEqual([]);
	});

	it('shows at most three, dropping the oldest', () => {
		for (const m of ['a', 'b', 'c', 'd']) notify({ kind: 'error', message: m });
		expect(notifications.items.map((n) => n.message)).toEqual(['b', 'c', 'd']);
	});

	it('drops the oldest that is not an error: an error and its Retry stay until dismissed', () => {
		notify({ kind: 'error', message: 'Could not save' });
		for (const m of ['a', 'b', 'c', 'd']) notify({ kind: 'success', message: m });
		expect(notifications.items.map((n) => n.message)).toEqual(['Could not save', 'c', 'd']);
	});

	it('never makes room for a success by dropping one of three errors', () => {
		for (const m of ['e1', 'e2', 'e3']) notify({ kind: 'error', message: m });
		notify({ kind: 'success', message: 'ok' });
		expect(notifications.items.map((n) => n.message)).toEqual(['e1', 'e2', 'e3']);
	});

	it('keeps the action', () => {
		const run = vi.fn();
		notify({ kind: 'error', message: 'x', action: { label: 'Retry', run } });
		notifications.items[0].action!.run();
		expect(run).toHaveBeenCalled();
	});
});
