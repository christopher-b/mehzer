import { describe, expect, it, vi } from 'vitest';
import { createR2Storage } from './r2.ts';

function fakeBucket() {
	const store = new Map<string, { value: Uint8Array; httpMetadata?: { contentType?: string } }>();
	const bucket = {
		put: vi.fn(async (key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) => {
			store.set(key, { value, httpMetadata: options?.httpMetadata });
		}),
		get: vi.fn(async (key: string) => {
			const entry = store.get(key);
			if (!entry) return null;
			return {
				body: new Response(entry.value as BodyInit).body,
				size: entry.value.byteLength,
				httpMetadata: entry.httpMetadata
			};
		}),
		delete: vi.fn(async (key: string) => void store.delete(key))
	};
	return { bucket, store };
}

describe('createR2Storage', () => {
	it('stores with the content type and reads back body, type and size', async () => {
		const { bucket } = fakeBucket();
		const storage = createR2Storage(bucket as never);
		await storage.put('k.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg');
		expect(bucket.put).toHaveBeenCalledWith('k.jpg', expect.any(Uint8Array), {
			httpMetadata: { contentType: 'image/jpeg' }
		});

		const blob = (await storage.get('k.jpg'))!;
		expect(blob.contentType).toBe('image/jpeg');
		expect(blob.size).toBe(3);
		expect(Array.from(new Uint8Array(await new Response(blob.body).arrayBuffer()))).toEqual([1, 2, 3]);
	});

	it('returns null for a missing object', async () => {
		const storage = createR2Storage(fakeBucket().bucket as never);
		expect(await storage.get('missing')).toBeNull();
	});

	it('defaults the content type when R2 has none', async () => {
		const { bucket, store } = fakeBucket();
		store.set('k', { value: new Uint8Array([1]) });
		expect((await createR2Storage(bucket as never).get('k'))!.contentType).toBe(
			'application/octet-stream'
		);
	});

	it('deletes', async () => {
		const { bucket } = fakeBucket();
		const storage = createR2Storage(bucket as never);
		await storage.put('k', new Uint8Array([1]), 'a/b');
		await storage.delete('k');
		expect(await storage.get('k')).toBeNull();
	});
});
