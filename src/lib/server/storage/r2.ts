import type { BlobStorage } from './types';

export function createR2Storage(bucket: R2Bucket): BlobStorage {
	return {
		async put(key, data, contentType) {
			await bucket.put(key, data, { httpMetadata: { contentType } });
		},

		async get(key) {
			const obj = await bucket.get(key);
			if (!obj) return null;
			return {
				body: obj.body as unknown as ReadableStream<Uint8Array>,
				contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
				size: obj.size
			};
		},

		async delete(key) {
			await bucket.delete(key);
		}
	};
}
