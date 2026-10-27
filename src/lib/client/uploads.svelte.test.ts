import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendPhoto = vi.fn();
vi.mock('./upload.ts', () => ({
	RefusedError: class RefusedError extends Error {},
	prepareImage: vi.fn(async (file: File) => ({ blob: file, width: 1, height: 1 })),
	sendPhoto: (...args: unknown[]) => sendPhoto(...args)
}));
vi.mock('./session.svelte.ts', () => ({ showSessionExpired: vi.fn() }));

import { UploadQueue } from './uploads.svelte.ts';

const file = (name: string) => new File(['x'], name);
const deferred = () => {
	let resolve!: (id: string) => void;
	const promise = new Promise<string>((r) => (resolve = r));
	return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => sendPhoto.mockReset());

describe('UploadQueue', () => {
	it('uploads each file to the project it was added under, even if the project changes later', async () => {
		let project = 'p1';
		sendPhoto.mockResolvedValue('photo');
		const onsettled = vi.fn();
		const queue = new UploadQueue(() => project, onsettled);
		queue.add([file('a.jpg'), file('b.jpg')], null);
		project = 'p2';
		await vi.waitFor(() => expect(onsettled).toHaveBeenCalled());
		expect(sendPhoto.mock.calls.map((c) => c[0])).toEqual(['p1', 'p1']);
	});

	it('destroy() mid-batch aborts the upload in flight and never calls onsettled', async () => {
		const first = deferred();
		sendPhoto.mockImplementationOnce(() => first.promise);
		const onsettled = vi.fn();
		const queue = new UploadQueue(() => 'p1', onsettled);
		queue.add([file('a.jpg'), file('b.jpg')], null);
		await vi.waitFor(() => expect(sendPhoto).toHaveBeenCalledTimes(1));
		const signal = sendPhoto.mock.calls[0][4] as AbortSignal;

		queue.destroy();
		expect(signal.aborted).toBe(true);
		first.resolve('late');
		await tick();
		expect(sendPhoto).toHaveBeenCalledTimes(1);
		expect(onsettled).not.toHaveBeenCalled();
	});

	it('files added while onsettled is running are uploaded, and onsettled runs again for them', async () => {
		sendPhoto.mockResolvedValue('photo');
		const gate = deferred();
		let calls = 0;
		const queue: UploadQueue = new UploadQueue(
			() => 'p1',
			async () => {
				calls++;
				if (calls === 1) {
					queue.add([file('late.jpg')], null);
					await gate.promise;
				}
			}
		);
		queue.add([file('a.jpg')], null);
		await vi.waitFor(() => expect(calls).toBe(1));
		expect(sendPhoto).toHaveBeenCalledTimes(1); // not started yet: the first run is still settling
		gate.resolve('');
		await vi.waitFor(() => expect(calls).toBe(2));
		expect(sendPhoto).toHaveBeenCalledTimes(2);
	});

	it('a failing onsettled is logged, not left as an unhandled rejection', async () => {
		sendPhoto.mockResolvedValue('photo');
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const queue = new UploadQueue(
			() => 'p1',
			async () => {
				throw new Error('goto failed');
			}
		);
		queue.add([file('a.jpg')], null);
		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		error.mockRestore();
	});
});
