/** The state of each file in an upload batch, as plain data and a pure reducer (no DOM, easy to test). */
export type UploadStatus = 'queued' | 'preparing' | 'uploading' | 'uploaded' | 'failed' | 'not-uploaded';

export interface UploadItem {
	id: number;
	name: string;
	roomId: string | null;
	status: UploadStatus;
	/** 0 to 1 while uploading. */
	progress: number;
	/** Why it failed, in words for the user. */
	message?: string;
	/** Whether trying again could help (false for a file the server or browser refuses). */
	retryable: boolean;
	photoId?: string;
}

export type UploadAction =
	| { type: 'add'; items: { id: number; name: string; roomId: string | null }[] }
	| { type: 'preparing'; id: number }
	| { type: 'uploading'; id: number }
	| { type: 'progress'; id: number; fraction: number }
	| { type: 'uploaded'; id: number; photoId: string }
	| { type: 'failed'; id: number; message: string; retryable: boolean }
	| { type: 'retry'; id: number }
	/** The session ended: files not yet sent are not uploaded, and can be retried after signing in. */
	| { type: 'session-expired' }
	| { type: 'clear' };

const PENDING: UploadStatus[] = ['queued', 'preparing', 'uploading'];

export function reduceUploads(items: UploadItem[], action: UploadAction): UploadItem[] {
	const update = (id: number, change: Partial<UploadItem>) =>
		items.map((item) => (item.id === id ? { ...item, ...change } : item));
	switch (action.type) {
		case 'add':
			return [
				...items,
				...action.items.map((i): UploadItem => ({ ...i, status: 'queued', progress: 0, retryable: false }))
			];
		case 'preparing':
			return update(action.id, { status: 'preparing', progress: 0 });
		case 'uploading':
			return update(action.id, { status: 'uploading' });
		case 'progress':
			return update(action.id, { progress: Math.min(1, Math.max(0, action.fraction)) });
		case 'uploaded':
			return update(action.id, { status: 'uploaded', progress: 1, photoId: action.photoId, message: undefined });
		case 'failed':
			return update(action.id, { status: 'failed', message: action.message, retryable: action.retryable });
		case 'retry':
			if (!items.some((i) => i.id === action.id && (i.status === 'failed' || i.status === 'not-uploaded'))) return items;
			return update(action.id, { status: 'queued', progress: 0, message: undefined, retryable: false });
		case 'session-expired':
			return items.map((item) =>
				PENDING.includes(item.status) ? { ...item, status: 'not-uploaded', retryable: true } : item
			);
		case 'clear':
			return [];
	}
}

/** The status text shown beside a file. */
export function statusLabel(item: UploadItem): string {
	switch (item.status) {
		case 'queued':
			return 'Waiting';
		case 'preparing':
			return 'Preparing';
		case 'uploading':
			return `Uploading ${Math.round(item.progress * 100)}%`;
		case 'uploaded':
			return 'Uploaded';
		case 'failed':
			return `Failed: ${item.message ?? 'Something went wrong.'}`;
		case 'not-uploaded':
			return 'Not uploaded';
	}
}

/** True while any file is waiting or in progress. */
export const isBusy = (items: UploadItem[]) => items.some((i) => PENDING.includes(i.status));

/** True when there is a batch and every file made it. */
export const allUploaded = (items: UploadItem[]) => items.length > 0 && items.every((i) => i.status === 'uploaded');
