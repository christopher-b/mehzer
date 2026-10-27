import { ActionError, messageFor } from './errors.ts';
import { showSessionExpired } from './session.svelte.ts';
import { allUploaded, isBusy, reduceUploads, type UploadAction, type UploadItem } from './upload-state.ts';
import { RefusedError, prepareImage, sendPhoto } from './upload.ts';

/** Uploads photos to a project one at a time, keeping per-file state for the page to show. */
export class UploadQueue {
	items = $state<UploadItem[]>([]);
	// The project is read once, when the files are added, so a queue never sends a file to another project.
	#files = new Map<number, { file: File; projectId: string }>();
	#nextId = 1;
	#running = false;
	#sessionEnded = false;
	#destroyed = false;
	#abort = new AbortController();
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
		if (this.#destroyed) return;
		const projectId = this.#projectId();
		const added = Array.from(files).map((file) => {
			const id = this.#nextId++;
			this.#files.set(id, { file, projectId });
			return { id, name: file.name, roomId };
		});
		this.#dispatch({ type: 'add', items: added });
		this.#start();
	}

	retry(id: number) {
		this.#dispatch({ type: 'retry', id });
		this.#start();
	}

	/** Stops for good: cancels the upload in flight and never calls `onsettled` (the page is gone). */
	destroy() {
		this.#destroyed = true;
		this.#abort.abort();
		this.#files.clear();
	}

	#start() {
		this.#run().catch((err) => console.error('Upload queue failed', err));
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
			// `#running` stays true until `onsettled` is done, so files added meanwhile join this run.
			do {
				for (let item = this.#next(); item && !this.#destroyed; item = this.#next()) await this.#upload(item);
				// With no session, reloading the page data would only bounce to the sign-in page.
				if (this.#destroyed || this.#sessionEnded) return;
				await this.#onsettled(this.items);
			} while (this.#next() && !this.#destroyed);
			if (allUploaded(this.items)) this.dismiss();
		} finally {
			this.#running = false;
		}
	}

	#next() {
		return this.items.find((i) => i.status === 'queued');
	}

	async #upload(item: UploadItem) {
		const queued = this.#files.get(item.id)!;
		this.#dispatch({ type: 'preparing', id: item.id });
		try {
			const prepared = await prepareImage(queued.file);
			this.#dispatch({ type: 'uploading', id: item.id });
			const photoId = await sendPhoto(
				queued.projectId,
				prepared,
				item.roomId,
				(fraction) => this.#dispatch({ type: 'progress', id: item.id, fraction }),
				this.#abort.signal
			);
			this.#dispatch({ type: 'uploaded', id: item.id, photoId });
			this.#files.delete(item.id);
		} catch (err) {
			if (this.#destroyed) return;
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
