import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { annotations, photos } from '#lib/server/db/schema.ts';
import type { PageData } from '../routes/p/[id]/photo/[photoId]/$types';
import { actions, load } from '../routes/p/[id]/photo/[photoId]/+page.server.ts';
import {
	call,
	callLoad,
	createContext,
	failure,
	formData,
	seedAnnotation,
	seedPhoto,
	seedProject,
	seedRoom
} from './helpers.ts';

async function setup(unitSystem: 'imperial' | 'metric' = 'imperial') {
	const ctx = createContext();
	const project = await seedProject(ctx.db, { unitSystem });
	const photo = await seedPhoto(ctx.db, project.id);
	return { ...ctx, project, photo, params: { id: project.id, photoId: photo.id } };
}

describe('photo page load', () => {
	it('lists rooms in creation order and numbers unnamed measurements', async () => {
		const s = await setup();
		await seedRoom(s.db, s.project.id, 'Zeta');
		await seedRoom(s.db, s.project.id, 'Alpha');
		const a = await seedAnnotation(s.db, s.photo.id);
		const b = await seedAnnotation(s.db, s.photo.id);

		const data = await callLoad<PageData>(load, { locals: s.locals, params: s.params });
		expect(data.rooms.map((r) => r.name)).toEqual(['Zeta', 'Alpha']);
		expect(data.annotations.map((x) => [x.id, x.number])).toEqual([[a.id, 1], [b.id, 2]]);
	});
});

const run = (
	name: keyof typeof actions,
	s: Awaited<ReturnType<typeof setup>>,
	fields: Record<string, string | number | null> = {},
	params = s.params
) => call(actions[name], { locals: s.locals, params, form: formData(fields) });

const line = { x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.2 };
const all = (s: Awaited<ReturnType<typeof setup>>) => s.db.select().from(annotations);

describe('photo page load', () => {
	it("returns the photo, its measurements and the project's rooms", async () => {
		const s = await setup();
		await seedRoom(s.db, s.project.id, 'Kitchen');
		await seedAnnotation(s.db, s.photo.id);
		const other = await seedPhoto(s.db, s.project.id);
		await seedAnnotation(s.db, other.id);

		const data = await callLoad<PageData>(load, { locals: s.locals, params: s.params });
		expect(data.photo.id).toBe(s.photo.id);
		expect(data.annotations).toHaveLength(1);
		expect(data.rooms.map((r) => r.name)).toEqual(['Kitchen']);
	});

	it('reports where the photo sits among the photos in its room', async () => {
		const s = await setup();
		const room = await seedRoom(s.db, s.project.id);
		const first = await seedPhoto(s.db, s.project.id, { roomId: room.id });
		const middle = await seedPhoto(s.db, s.project.id, { roomId: room.id });
		const last = await seedPhoto(s.db, s.project.id, { roomId: room.id });

		const data = await callLoad<PageData>(load, {
			locals: s.locals,
			params: { id: s.project.id, photoId: middle.id }
		});
		expect(data.neighbours).toMatchObject({
			position: 2,
			total: 3,
			previous: { id: first.id },
			next: { id: last.id }
		});

		// the photo from setup() has no room, so it is alone in "No room"
		const alone = await callLoad<PageData>(load, { locals: s.locals, params: s.params });
		expect(alone.neighbours).toMatchObject({ position: 1, total: 1, previous: null, next: null });
	});

	it('404s for a photo in another project or an unknown project', async () => {
		const s = await setup();
		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedPhoto(s.db, other.id);
		await expect(
			callLoad(load, { locals: s.locals, params: { id: s.project.id, photoId: foreign.id } })
		).rejects.toMatchObject({ status: 404 });
		await expect(
			callLoad(load, { locals: s.locals, params: { id: 'nope', photoId: s.photo.id } })
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('photo actions: create', () => {
	it('creates a measurement using the project units', async () => {
		const s = await setup('imperial');
		const result = await run('create', s, { ...line, value: `12' 6"`, name: 'Width' });
		expect(result).toEqual({ id: expect.any(String) });
		const [row] = await all(s);
		expect(row).toMatchObject({ photoId: s.photo.id, name: 'Width', ...line });
		expect(row.valueMm).toBeCloseTo(12.5 * 304.8, 6);
	});

	it('reads a bare number as metres in a metric project', async () => {
		const s = await setup('metric');
		await run('create', s, { ...line, value: '3.2' });
		expect((await all(s))[0].valueMm).toBe(3200);
	});

	it('allows no value and no name', async () => {
		const s = await setup();
		await run('create', s, { ...line });
		expect((await all(s))[0]).toMatchObject({ name: null, valueMm: null });
	});

	it.each([
		['out-of-range point', { x1: 0.1, y1: 0.2, x2: 1.5, y2: 0.2 }, 'Invalid line endpoints'],
		['zero-length line', { x1: 0.3, y1: 0.3, x2: 0.3, y2: 0.3 }, 'Invalid line endpoints'],
		['unreadable value', { ...line, value: 'banana' }, 'banana'],
		['over-long name', { ...line, name: 'x'.repeat(101) }, '100 characters']
	])('rejects %s without saving', async (_l, fields, message) => {
		const s = await setup();
		const result = failure(await run('create', s, fields));
		expect(result?.status).toBe(400);
		expect(result?.error).toContain(message);
		expect(await all(s)).toHaveLength(0);
	});

	it('404s for a photo in another project', async () => {
		const s = await setup();
		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedPhoto(s.db, other.id);
		await expect(
			run('create', s, line, { id: s.project.id, photoId: foreign.id })
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('photo actions: update / move / delete', () => {
	it('updates name and value but not the line', async () => {
		const s = await setup();
		const a = await seedAnnotation(s.db, s.photo.id, { name: 'Old', valueMm: 1000 });
		await run('update', s, { id: a.id, name: 'New', value: '3m', x1: 0.5 });
		const row = (await s.db.query.annotations.findFirst({ where: eq(annotations.id, a.id) }))!;
		expect(row).toMatchObject({ name: 'New', valueMm: 3000, x1: a.x1 });
	});

	it('can clear a value and a name', async () => {
		const s = await setup();
		const a = await seedAnnotation(s.db, s.photo.id, { name: 'Old', valueMm: 1000 });
		await run('update', s, { id: a.id, name: '', value: '' });
		expect((await all(s))[0]).toMatchObject({ name: null, valueMm: null });
	});

	it('keeps the old value when the new one is unreadable', async () => {
		const s = await setup();
		const a = await seedAnnotation(s.db, s.photo.id, { valueMm: 1000 });
		expect(failure(await run('update', s, { id: a.id, value: 'nope' }))?.status).toBe(400);
		expect((await all(s))[0].valueMm).toBe(1000);
	});

	it('moves the endpoints and validates them', async () => {
		const s = await setup();
		const a = await seedAnnotation(s.db, s.photo.id);
		await run('move', s, { id: a.id, x1: 0.2, y1: 0.3, x2: 0.4, y2: 0.5 });
		expect((await all(s))[0]).toMatchObject({ x1: 0.2, y1: 0.3, x2: 0.4, y2: 0.5 });
		expect(failure(await run('move', s, { id: a.id, x1: 2, y1: 0, x2: 0, y2: 0 }))?.status).toBe(400);
		expect((await all(s))[0].x1).toBe(0.2);
	});

	it('deletes a measurement', async () => {
		const s = await setup();
		const a = await seedAnnotation(s.db, s.photo.id);
		await run('delete', s, { id: a.id });
		expect(await all(s)).toHaveLength(0);
		expect(failure(await run('delete', s, { id: a.id }))?.status).toBe(404);
	});

	it("never touches a measurement on a different photo", async () => {
		const s = await setup();
		const otherPhoto = await seedPhoto(s.db, s.project.id);
		const theirs = await seedAnnotation(s.db, otherPhoto.id, { name: 'Theirs', valueMm: 5000 });

		expect(failure(await run('update', s, { id: theirs.id, name: 'Hijack' }))?.status).toBe(404);
		expect(failure(await run('move', s, { id: theirs.id, ...line }))?.status).toBe(404);
		expect(failure(await run('delete', s, { id: theirs.id }))?.status).toBe(404);
		expect((await all(s))[0]).toMatchObject({ name: 'Theirs', valueMm: 5000, x1: theirs.x1 });
	});
});

describe('photo actions: setRoom', () => {
	it('puts the photo in a room and back, and its measurements follow', async () => {
		const s = await setup();
		const room = await seedRoom(s.db, s.project.id);
		await run('setRoom', s, { roomId: room.id });
		expect((await s.db.query.photos.findFirst({ where: eq(photos.id, s.photo.id) }))!.roomId).toBe(room.id);
		await run('setRoom', s, { roomId: '' });
		expect((await s.db.query.photos.findFirst({ where: eq(photos.id, s.photo.id) }))!.roomId).toBeNull();
	});

	it('rejects a room from another project', async () => {
		const s = await setup();
		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedRoom(s.db, other.id);
		expect(failure(await run('setRoom', s, { roomId: foreign.id }))?.status).toBe(400);
	});
});

describe('photo actions: deletePhoto', () => {
	it('deletes the photo, its measurements and its file, then redirects to the project', async () => {
		const s = await setup();
		await s.storage.put(s.photo.blobKey, new Uint8Array([1, 2]), 'image/jpeg');
		await seedAnnotation(s.db, s.photo.id);

		await expect(run('deletePhoto', s)).rejects.toMatchObject({
			status: 303,
			location: `/p/${s.project.id}`
		});

		expect(await s.db.select().from(photos)).toHaveLength(0);
		expect(await all(s)).toHaveLength(0);
		expect(s.blobs.has(s.photo.blobKey)).toBe(false);
	});

	it('404s for a photo in another project and deletes nothing', async () => {
		const s = await setup();
		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedPhoto(s.db, other.id);
		await expect(
			run('deletePhoto', s, {}, { id: s.project.id, photoId: foreign.id })
		).rejects.toMatchObject({ status: 404 });
		expect(await s.db.select().from(photos)).toHaveLength(2);
	});
});
