import { UnreadableImageError, resizeImage } from '#lib/image.ts';
import { ActionError, classifyThrown } from './errors.ts';

/** A file the browser or server will not take; trying again cannot help. */
export class RefusedError extends Error {}

/** A stalled connection must not hold up the rest of the queue. */
export const UPLOAD_TIMEOUT_MS = 120_000;

export const UNREADABLE_IMAGE = "This file couldn't be read as an image.";

/** Shrinks a file to a JPEG ready to upload. */
export async function prepareImage(file: File) {
	try {
		return await resizeImage(file);
	} catch (e) {
		if (e instanceof UnreadableImageError) throw new RefusedError(UNREADABLE_IMAGE);
		throw e;
	}
}

/**
 * Sends one prepared photo with progress reports (XMLHttpRequest, because fetch cannot report upload
 * progress; `signal` aborts it). Resolves with the new photo's id. Rejects with an `ActionError` for problems that retrying
 * may fix (offline, timeout, session, server) and a `RefusedError` for ones it cannot (the server's own message).
 */
export function sendPhoto(
	projectId: string,
	prepared: { blob: Blob; width: number; height: number },
	roomId: string | null,
	onprogress: (fraction: number) => void,
	signal?: AbortSignal
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(classifyThrown(new TypeError('network')));
		const body = new FormData();
		body.set('file', prepared.blob, 'photo.jpg');
		body.set('width', String(prepared.width));
		body.set('height', String(prepared.height));
		if (roomId) body.set('roomId', roomId);

		const xhr = new XMLHttpRequest();
		xhr.open('POST', `/api/projects/${projectId}/photos`);
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.timeout = UPLOAD_TIMEOUT_MS;
		signal?.addEventListener('abort', () => xhr.abort(), { once: true });
		xhr.upload.onprogress = (e) => e.lengthComputable && onprogress(e.loaded / e.total);
		xhr.onerror = () => reject(classifyThrown(new TypeError('network')));
		xhr.onabort = () => reject(classifyThrown(new TypeError('network')));
		xhr.ontimeout = () => reject(classifyThrown(new TypeError('network')));
		xhr.onload = () => {
			const parsed = parse(xhr.responseText);
			if (xhr.status >= 200 && xhr.status < 300 && typeof parsed?.id === 'string') return resolve(parsed.id);
			if (xhr.status === 401 || (xhr.responseURL && new URL(xhr.responseURL).pathname === '/login')) {
				return reject(new ActionError('session'));
			}
			if (xhr.status >= 400 && xhr.status < 500 && typeof parsed?.message === 'string') {
				return reject(new RefusedError(parsed.message));
			}
			reject(new ActionError('server', undefined, typeof parsed?.id === 'string' ? parsed.id : undefined));
		};
		xhr.send(body);
	});
}

function parse(text: string): { id?: unknown; message?: unknown } | null {
	try {
		const value = JSON.parse(text);
		return value && typeof value === 'object' ? value : null;
	} catch {
		return null;
	}
}

