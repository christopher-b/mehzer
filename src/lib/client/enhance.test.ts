import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('./session.svelte.ts', () => ({ showSessionExpired: vi.fn() }));
vi.mock('./notify.svelte.ts', () => ({ notify: vi.fn() }));

import { inlineErrors, submitWith } from './enhance.ts';

function start(handler: ReturnType<typeof submitWith>, formElement: object) {
	const cancel = vi.fn();
	const callback = handler({ cancel, formElement } as never) as unknown as
		| ((e: unknown) => Promise<void>)
		| undefined;
	return { cancel, callback };
}

const success = { result: { type: 'success', status: 200 }, update: vi.fn(async () => {}) };

describe('submitWith', () => {
	it('drops a second submit while the first is pending, and allows one afterwards', async () => {
		const handler = submitWith();
		const form = {};
		const first = start(handler, form);
		expect(first.cancel).not.toHaveBeenCalled();

		const second = start(handler, form);
		expect(second.cancel).toHaveBeenCalledOnce();
		expect(second.callback).toBeUndefined();

		await first.callback!(success);
		const third = start(handler, form);
		expect(third.cancel).not.toHaveBeenCalled();
		await third.callback!(success);
	});

	it('does not block other forms', () => {
		const handler = submitWith();
		start(handler, {});
		expect(start(handler, {}).cancel).not.toHaveBeenCalled();
	});

	it('tells the caller when the request starts and ends, even if it fails', async () => {
		const pending = vi.fn();
		const { callback } = start(submitWith({ pending }), {});
		expect(pending).toHaveBeenCalledExactlyOnceWith(true);
		await callback!({ result: { type: 'failure', status: 400 }, update: vi.fn(async () => {}) });
		expect(pending).toHaveBeenLastCalledWith(false);

		const throwing = vi.fn();
		const again = start(submitWith({ pending: throwing, onSuccess: () => { throw new Error('boom'); } }), {});
		await expect(again.callback!(success)).rejects.toThrow('boom');
		expect(throwing).toHaveBeenLastCalledWith(false);
	});

	it('does not start a request, or mark the form busy, when the confirmation is refused', () => {
		const pending = vi.fn();
		const form = {};
		const { cancel } = start(submitWith({ confirm: () => false, pending }), form);
		expect(cancel).toHaveBeenCalledOnce();
		expect(pending).not.toHaveBeenCalled();
		expect(start(submitWith(), form).cancel).not.toHaveBeenCalled();
	});
});

describe('inlineErrors', () => {
	it('clears the message when a submit starts, and shows an error or a failure message', () => {
		const set = vi.fn();
		const options = inlineErrors(set, 'Could not save');
		options.before?.();
		options.onError?.('Offline', {} as never);
		options.onFailure?.({ status: 400, data: { error: 'Name needed' } });
		options.onFailure?.({ status: 400 });
		expect(set.mock.calls).toEqual([[''], ['Offline'], ['Name needed'], ['Could not save']]);
	});

	it('leaves a fail(...) result to SvelteKit when there is no fallback', () => {
		expect(inlineErrors(vi.fn()).onFailure).toBeUndefined();
	});
});
