import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { photos } from '#lib/server/db/schema.ts';
import { POST } from '../routes/api/projects/[id]/photos/+server.ts';
import { createContext, formData, imageFile, seedProject, seedRoom } from './helpers.ts';

async function setup() {
	const ctx = createContext();
	const project = await seedProject(ctx.db);
	return { ...ctx, project };
}

const jpeg = (size = 16, type = 'image/jpeg') => imageFile(type, size);

async function upload(
	s: Awaited<ReturnType<typeof setup>>,
	fields: Record<string, string | number | File | null>,
	projectId = s.project.id
) {
	const request = new Request('http://localhost/upload', { method: 'POST', body: formData(fields) });
	return POST({ request, locals: s.locals, params: { id: projectId } } as never);
}

type Photo = { projectId: string; blobKey: string; roomId: string | null; width: number; height: number };
const json = async (res: Response) => (await res.json()) as Photo;

const valid = () => ({ file: jpeg(), width: 640, height: 480 });

describe('POST /api/projects/[id]/photos', () => {
	it('stores the file and creates a photo row (in No room by default)', async () => {
		const s = await setup();
		const res = await upload(s, valid());

		expect(res.status).toBe(201);
		const body = await json(res);
		expect(body).toMatchObject({ projectId: s.project.id, width: 640, height: 480, roomId: null });
		expect(body.blobKey).toMatch(new RegExp(`^projects/${s.project.id}/[0-9a-f-]{36}\\.jpg$`));
		expect(s.blobs.get(body.blobKey)?.contentType).toBe('image/jpeg');
		expect(s.blobs.get(body.blobKey)?.data.byteLength).toBe(16);
		expect(await s.db.select().from(photos)).toHaveLength(1);
	});

	it('puts the photo straight into a room when roomId is given', async () => {
		const s = await setup();
		const room = await seedRoom(s.db, s.project.id);
		const body = await json(await upload(s, { ...valid(), roomId: room.id }));
		expect(body.roomId).toBe(room.id);
	});

	it.each([
		['image/png', 'png'],
		['image/webp', 'webp']
	])('accepts %s and uses the .%s extension', async (type, ext) => {
		const s = await setup();
		const body = await json(await upload(s, { ...valid(), file: jpeg(16, type) }));
		expect(body.blobKey.endsWith(`.${ext}`)).toBe(true);
	});

	it('rejects a file whose bytes are not the type it claims', async () => {
		const s = await setup();
		await expect(upload(s, { ...valid(), file: new File([await imageFile('image/jpeg').arrayBuffer()], 'p.png', { type: 'image/png' }) })).rejects.toMatchObject({ status: 415 });
		expect(s.blobs.size).toBe(0);
	});

	it('rejects a room from another project with 400, storing nothing', async () => {
		const s = await setup();
		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedRoom(s.db, other.id);
		await expect(upload(s, { ...valid(), roomId: foreign.id })).rejects.toMatchObject({ status: 400 });
		expect(s.blobs.size).toBe(0);
		expect(await s.db.select().from(photos)).toHaveLength(0);
	});

	it.each([
		['an unsupported type', { file: jpeg(10, 'image/gif'), width: 1, height: 1 }, 415],
		['a non-image type', { file: jpeg(10, 'text/plain'), width: 1, height: 1 }, 415],
		['a missing file', { width: 1, height: 1 }, 400],
		['a text field instead of a file', { file: 'abc', width: 1, height: 1 }, 400],
		['an empty file', { file: jpeg(0), width: 1, height: 1 }, 413],
		['a file over 15 MB', { file: jpeg(15 * 1024 * 1024 + 1), width: 1, height: 1 }, 413],
		['zero width', { file: jpeg(), width: 0, height: 480 }, 400],
		['a fractional height', { file: jpeg(), width: 640, height: 1.5 }, 400],
		['an oversized width', { file: jpeg(), width: 10_001, height: 480 }, 400],
		['missing dimensions', { file: jpeg() }, 400],
		['non-numeric dimensions', { file: jpeg(), width: 'wide', height: 'tall' }, 400]
	])('rejects %s with %i and stores nothing', async (_label, fields, status) => {
		const s = await setup();
		await expect(upload(s, fields as never)).rejects.toMatchObject({ status });
		expect(s.blobs.size).toBe(0);
		expect(await s.db.select().from(photos)).toHaveLength(0);
	});

	it('accepts a file of exactly 15 MB', async () => {
		const s = await setup();
		const res = await upload(s, { ...valid(), file: jpeg(15 * 1024 * 1024) });
		expect(res.status).toBe(201);
	});

	it('404s for an unknown project', async () => {
		const s = await setup();
		await expect(upload(s, valid(), 'nope')).rejects.toMatchObject({ status: 404 });
		expect(s.blobs.size).toBe(0);
	});

	it('removes the stored file if the database insert fails', async () => {
		const s = await setup();
		// A project deleted between the lookup and the insert would violate the foreign key.
		const original = s.db.insert.bind(s.db);
		(s.db as any).insert = (table: unknown) => {
			const builder = original(table as never) as any;
			builder.values = () => ({ returning: () => Promise.reject(new Error('boom')) });
			return builder;
		};
		await expect(upload(s, valid())).rejects.toThrow('boom');
		expect(s.blobs.size).toBe(0);
		expect(await s.db.select().from(photos).where(eq(photos.projectId, s.project.id))).toHaveLength(0);
	});
});
