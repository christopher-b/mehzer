import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFsStorage } from './fs.ts';

let root: string;
beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'mehzer-fs-'));
});
afterAll(() => rm(root, { recursive: true, force: true }));

const bytes = (...n: number[]) => new Uint8Array(n);
const read = async (body: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(body).arrayBuffer());

describe('createFsStorage', () => {
	it('round-trips bytes, content type and size', async () => {
		const storage = createFsStorage(join(root, 'a'));
		await storage.put('projects/p1/photo.jpg', bytes(1, 2, 3, 4), 'image/jpeg');

		const blob = await storage.get('projects/p1/photo.jpg');
		expect(blob).not.toBeNull();
		expect(blob!.contentType).toBe('image/jpeg');
		expect(blob!.size).toBe(4);
		expect(Array.from(await read(blob!.body))).toEqual([1, 2, 3, 4]);
	});

	it('accepts an ArrayBuffer', async () => {
		const storage = createFsStorage(join(root, 'ab'));
		await storage.put('x.bin', bytes(9, 8).buffer, 'application/octet-stream');
		expect(Array.from(await read((await storage.get('x.bin'))!.body))).toEqual([9, 8]);
	});

	it('returns null for a missing key', async () => {
		const storage = createFsStorage(join(root, 'b'));
		expect(await storage.get('nope.jpg')).toBeNull();
	});

	it('overwrites an existing key', async () => {
		const storage = createFsStorage(join(root, 'c'));
		await storage.put('k', bytes(1), 'a/b');
		await storage.put('k', bytes(2, 2), 'c/d');
		const blob = (await storage.get('k'))!;
		expect(blob.contentType).toBe('c/d');
		expect(blob.size).toBe(2);
	});

	it('deletes a blob and is idempotent', async () => {
		const storage = createFsStorage(join(root, 'd'));
		await storage.put('k', bytes(1), 'a/b');
		await storage.delete('k');
		expect(await storage.get('k')).toBeNull();
		await expect(storage.delete('k')).resolves.toBeUndefined();
	});

	it('falls back to octet-stream when the metadata file is missing', async () => {
		const dir = join(root, 'e');
		const storage = createFsStorage(dir);
		await storage.put('k', bytes(1), 'image/png');
		await rm(join(dir, 'k.meta'));
		expect((await storage.get('k'))!.contentType).toBe('application/octet-stream');
	});

	it('stores files under the root directory', async () => {
		const dir = join(root, 'f');
		await createFsStorage(dir).put('nested/deep/k.jpg', bytes(7), 'image/jpeg');
		expect(Array.from(await readFile(join(dir, 'nested/deep/k.jpg')))).toEqual([7]);
	});

	it.each(['../escape', 'a/../../escape', '/etc/passwd', '..'])(
		'refuses key %j that would escape the root',
		async (key) => {
			const storage = createFsStorage(join(root, 'g'));
			await writeFile(join(root, 'escape'), 'secret');
			await expect(storage.put(key, bytes(1), 'x/y')).rejects.toThrow('Invalid blob key');
			await expect(storage.get(key)).rejects.toThrow('Invalid blob key');
			await expect(storage.delete(key)).rejects.toThrow('Invalid blob key');
			expect(await readFile(join(root, 'escape'), 'utf8')).toBe('secret');
		}
	);
});
