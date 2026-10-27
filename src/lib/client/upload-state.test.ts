import { describe, expect, it } from 'vitest';
import { allUploaded, isBusy, reduceUploads, statusLabel, type UploadAction, type UploadItem } from './upload-state.ts';

const run = (actions: UploadAction[], from: UploadItem[] = []) => actions.reduce(reduceUploads, from);
const three: UploadAction = {
	type: 'add',
	items: [1, 2, 3].map((id) => ({ id, name: `p${id}.jpg`, roomId: null }))
};

describe('upload state', () => {
	it('adds files as waiting', () => {
		const items = run([three]);
		expect(items.map((i) => statusLabel(i))).toEqual(['Waiting', 'Waiting', 'Waiting']);
		expect(isBusy(items)).toBe(true);
	});

	it('walks one file from preparing through uploading to uploaded', () => {
		let items = run([three, { type: 'preparing', id: 1 }]);
		expect(statusLabel(items[0])).toBe('Preparing');
		items = run([{ type: 'uploading', id: 1 }, { type: 'progress', id: 1, fraction: 0.4 }], items);
		expect(statusLabel(items[0])).toBe('Uploading 40%');
		items = run([{ type: 'uploaded', id: 1, photoId: 'abc' }], items);
		expect(statusLabel(items[0])).toBe('Uploaded');
		expect(items[0].photoId).toBe('abc');
	});

	it('keeps progress between 0 and 1', () => {
		const items = run([three, { type: 'progress', id: 1, fraction: 7 }]);
		expect(items[0].progress).toBe(1);
	});

	it('shows a failure with its message, and a retry puts only that file back in the queue', () => {
		let items = run([
			three,
			{ type: 'uploaded', id: 1, photoId: 'a' },
			{ type: 'failed', id: 2, message: 'Something went wrong.', retryable: true },
			{ type: 'uploaded', id: 3, photoId: 'c' }
		]);
		expect(statusLabel(items[1])).toBe('Failed: Something went wrong.');
		expect(isBusy(items)).toBe(false);
		expect(allUploaded(items)).toBe(false);
		items = run([{ type: 'retry', id: 2 }], items);
		expect(items.map((i) => i.status)).toEqual(['uploaded', 'queued', 'uploaded']);
		items = run([{ type: 'uploaded', id: 2, photoId: 'b' }], items);
		expect(allUploaded(items)).toBe(true);
		expect(items.map((i) => i.photoId)).toEqual(['a', 'b', 'c']);
	});

	it('ignores a retry for a file that has not failed', () => {
		const items = run([three, { type: 'uploaded', id: 1, photoId: 'a' }, { type: 'uploading', id: 2 }]);
		expect(run([{ type: 'retry', id: 1 }, { type: 'retry', id: 2 }], items)).toEqual(items);
	});

	it('marks everything not yet sent as not uploaded when the session ends, keeping finished files', () => {
		const items = run([three, { type: 'uploaded', id: 1, photoId: 'a' }, { type: 'preparing', id: 2 }, { type: 'session-expired' }]);
		expect(items.map((i) => statusLabel(i))).toEqual(['Uploaded', 'Not uploaded', 'Not uploaded']);
		expect(items[1].retryable).toBe(true);
	});

	it('is not "all uploaded" when empty, and clears', () => {
		expect(allUploaded([])).toBe(false);
		expect(run([three, { type: 'clear' }])).toEqual([]);
	});
});
