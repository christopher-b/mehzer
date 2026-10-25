import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { BlobStorage } from './types';

/** Stores each blob as `<root>/<key>` with its content type in `<root>/<key>.meta`. */
export function createFsStorage(root: string): BlobStorage {
	const base = resolve(root);

	const pathFor = (key: string) => {
		const p = resolve(base, key);
		if (!p.startsWith(base + sep)) throw new Error(`Invalid blob key: ${key}`);
		return p;
	};

	return {
		async put(key, data, contentType) {
			const p = pathFor(key);
			await mkdir(dirname(p), { recursive: true });
			await writeFile(p, data instanceof Uint8Array ? data : new Uint8Array(data));
			await writeFile(`${p}.meta`, contentType);
		},

		async get(key) {
			const p = pathFor(key);
			try {
				const { size } = await stat(p);
				const contentType = await readFile(`${p}.meta`, 'utf8').catch(
					() => 'application/octet-stream'
				);
				const body = Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
				return { body, contentType, size };
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
				throw e;
			}
		},

		async delete(key) {
			const p = pathFor(key);
			await rm(p, { force: true });
			await rm(`${p}.meta`, { force: true });
		}
	};
}
