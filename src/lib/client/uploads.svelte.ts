import { ActionError, messageFor } from './errors.ts';
import { showSessionExpired } from './session.svelte.ts';
import { allUploaded, isBusy, reduceUploads, type UploadAction, type UploadItem } from './upload-state.ts';
import { RefusedError, prepareImage, sendPhoto } from './upload.ts';

/** Uploads photos to a project one at a time, keeping per-file state for the page to show. */
export class UploadQueue {
	items = $state<UploadItem[]>([]);
	#files = new Map<number, File>();
	#nextId = 1;
	#running = false;
	#sessionEnded = false;
	#projectId: () => string;
	#onsettled: (items: UploadItem[]) => void | Promise<void>;

	constructor(projectId: () => string, onsettled: (items: UploadItem[]) => void | Promise<void>) {
		this.#projectId = projectId;
		this.#onsettled = onsettled;
	}

	get busy() {
		return isBusy(this.items);
	}

	#dispatch(action: UploadAction) {
		this.items = reduceUploads(this.items, action);
	}

	add(files: FileList | File[], roomId: string | null) {
		const added = Array.from(files).map((file) => {
			const id = this.#nextId++;
			this.#files.set(id, file);
			return { id, name: file.name, roomId };
		});
		this.#dispatch({ type: 'add', items: added });
		void this.#run();
	}

	retry(id: number) {
		this.#dispatch({ type: 'retry', id });
		void this.#run();
	}

	dismiss() {
		this.#files.clear();
		this.#dispatch({ type: 'clear' });
	}

	async #run() {
		if (this.#running) return;
		this.#running = true;
		this.#sessionEnded = false;
		try {
			for (let item = this.#next(); item; item = this.#next()) await this.#upload(item);
		} finally {
			this.#running = false;
		}
		// With no session, reloading the page data would only bounce to the sign-in page.
		if (this.#sessionEnded) return;
		await this.#onsettled(this.items);
		if (allUploaded(this.items)) this.dismiss();
	}

	#next() {
		return this.items.find((i) => i.status === 'queued');
	}

	async #upload(item: UploadItem) {
		const file = this.#files.get(item.id)!;
		this.#dispatch({ type: 'preparing', id: item.id });
		try {
			const prepared = await prepareImage(file);
			this.#dispatch({ type: 'uploading', id: item.id });
			const photoId = await sendPhoto(this.#projectId(), prepared, item.roomId, (fraction) =>
				this.#dispatch({ type: 'progress', id: item.id, fraction })
			);
			this.#dispatch({ type: 'uploaded', id: item.id, photoId });
		} catch (err) {
			if (err instanceof ActionError && err.kind === 'session') {
				this.#sessionEnded = true;
				this.#dispatch({ type: 'session-expired' });
				showSessionExpired();
				return;
			}
			const refused = err instanceof RefusedError;
			this.#dispatch({
				type: 'failed',
				id: item.id,
				message: refused ? err.message : messageFor(err),
				retryable: !refused
			});
		}
	}
}
