import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { annotations, photos, projects, rooms } from '#lib/server/db/schema.ts';
import type { PageData } from '../routes/p/[id]/$types';
import { actions, load } from '../routes/p/[id]/+page.server.ts';
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

async function setup() {
	const ctx = createContext();
	const project = await seedProject(ctx.db, { name: 'Elm St' });
	const params = { id: project.id };
	return { ...ctx, project, params };
}

const run = (
	name: keyof typeof actions,
	s: Awaited<ReturnType<typeof setup>>,
	fields: Record<string, string | null> = {},
	params = s.params
) => call(actions[name], { locals: s.locals, params, form: formData(fields) });

describe('project page load', () => {
	it('numbers measurements within their photo, follows photo order, and skips deleted ones', async () => {
		const s = await setup();
		const t = new Date(1_700_000_000_000);
		const p1 = await seedPhoto(s.db, s.project.id, { createdAt: t });
		const p2 = await seedPhoto(s.db, s.project.id, { createdAt: t });
		const a2 = await seedAnnotation(s.db, p2.id, { createdAt: t });
		const a1 = await seedAnnotation(s.db, p1.id, { createdAt: t });
		const b1 = await seedAnnotation(s.db, p1.id, { createdAt: t });
		const c1 = await seedAnnotation(s.db, p1.id, { createdAt: t });
		await s.db.delete(annotations).where(eq(annotations.id, b1.id));

		const data = await callLoad<PageData>(load, { locals: s.locals, params: s.params });
		expect(data.annotations.map((x) => [x.id, x.number])).toEqual([
			[a1.id, 1],
			[c1.id, 2],
			[a2.id, 1]
		]);
	});

	it('returns photos, measurements with their photo\'s room, and computed room areas', async () => {
		const s = await setup();
		const kitchen = await seedRoom(s.db, s.project.id, 'Kitchen');
		const kPhoto = await seedPhoto(s.db, s.project.id, { roomId: kitchen.id });
		const loose = await seedPhoto(s.db, s.project.id);
		const a = await seedAnnotation(s.db, kPhoto.id, { valueMm: 4000 });
		const b = await seedAnnotation(s.db, kPhoto.id, { valueMm: 3000 });
		const c = await seedAnnotation(s.db, loose.id, { valueMm: 1000 });
		await s.db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, kitchen.id));

		const data = (await callLoad<PageData>(load, { locals: s.locals, params: s.params }));

		expect(data.project.name).toBe('Elm St');
		expect(data.photos).toHaveLength(2);
		const byId = Object.fromEntries(data.annotations.map((x) => [x.id, x.roomId]));
		expect(byId).toEqual({ [a.id]: kitchen.id, [b.id]: kitchen.id, [c.id]: null });
		expect(data.rooms).toHaveLength(1);
		expect(data.rooms[0].areaMm2).toBe(12_000_000);
	});

	it('only shows data from this project and 404s for an unknown project', async () => {
		const s = await setup();
		const other = await seedProject(s.db, { name: 'Other' });
		await seedPhoto(s.db, other.id);
		await seedRoom(s.db, other.id);

		const data = await callLoad<PageData>(load, { locals: s.locals, params: s.params });
		expect(data.photos).toHaveLength(0);
		expect(data.rooms).toHaveLength(0);
		await expect(callLoad(load, { locals: s.locals, params: { id: 'nope' } })).rejects.toMatchObject({
			status: 404
		});
	});

	it('shows no area when the chosen measurements are no longer in the room', async () => {
		const s = await setup();
		const kitchen = await seedRoom(s.db, s.project.id);
		const photo = await seedPhoto(s.db, s.project.id, { roomId: kitchen.id });
		const a = await seedAnnotation(s.db, photo.id);
		const b = await seedAnnotation(s.db, photo.id);
		await s.db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, kitchen.id));
		await s.db.update(photos).set({ roomId: null }).where(eq(photos.id, photo.id));

		const data = await callLoad<PageData>(load, { locals: s.locals, params: s.params });
		expect(data.rooms[0].areaMm2).toBeNull();
	});
});

describe('project actions: update / delete', () => {
	it('renames and changes units', async () => {
		const s = await setup();
		expect(await run('update', s, { name: 'Oak Ave', unitSystem: 'metric' })).toEqual({ saved: true });
		const row = (await s.db.query.projects.findFirst({ where: eq(projects.id, s.project.id) }))!;
		expect(row).toMatchObject({ name: 'Oak Ave', unitSystem: 'metric' });
	});

	it.each([
		['blank name', { name: ' ', unitSystem: 'metric' }],
		['bad units', { name: 'X', unitSystem: 'cubits' }],
		['missing units', { name: 'X' }]
	])('rejects %s', async (_l, fields) => {
		const s = await setup();
		expect(failure(await run('update', s, fields))?.status).toBe(400);
		expect((await s.db.query.projects.findFirst({ where: eq(projects.id, s.project.id) }))!.name).toBe('Elm St');
	});

	it('deletes the project, its data and its blobs, then redirects home', async () => {
		const s = await setup();
		const photo = await seedPhoto(s.db, s.project.id, { blobKey: 'p/1.jpg' });
		await s.storage.put('p/1.jpg', new Uint8Array([1]), 'image/jpeg');
		await seedAnnotation(s.db, photo.id);

		await expect(run('delete', s)).rejects.toMatchObject({ status: 303, location: '/' });
		expect(await s.db.select().from(projects)).toHaveLength(0);
		expect(s.blobs.size).toBe(0);
	});
});

describe('project actions: rooms', () => {
	it('creates a room, trimming the name', async () => {
		const s = await setup();
		await run('createRoom', s, { name: '  Kitchen ' });
		expect((await s.db.select().from(rooms))[0]).toMatchObject({ name: 'Kitchen', projectId: s.project.id });
	});

	it('rejects a blank room name', async () => {
		const s = await setup();
		expect(failure(await run('createRoom', s, { name: '' }))?.status).toBe(400);
		expect(await s.db.select().from(rooms)).toHaveLength(0);
	});

	it('renames a room, and not one belonging to another project', async () => {
		const s = await setup();
		const room = await seedRoom(s.db, s.project.id, 'Old');
		await run('renameRoom', s, { roomId: room.id, name: 'New' });
		expect((await s.db.query.rooms.findFirst({ where: eq(rooms.id, room.id) }))!.name).toBe('New');

		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedRoom(s.db, other.id, 'Theirs');
		expect(failure(await run('renameRoom', s, { roomId: foreign.id, name: 'Hijack' }))?.status).toBe(404);
		expect((await s.db.query.rooms.findFirst({ where: eq(rooms.id, foreign.id) }))!.name).toBe('Theirs');
		expect(failure(await run('renameRoom', s, { roomId: room.id, name: '' }))?.status).toBe(400);
	});

	it('deletes a room (photos go to No room) but not a foreign room', async () => {
		const s = await setup();
		const room = await seedRoom(s.db, s.project.id);
		const photo = await seedPhoto(s.db, s.project.id, { roomId: room.id });
		await run('deleteRoom', s, { roomId: room.id });
		expect(await s.db.select().from(rooms)).toHaveLength(0);
		expect((await s.db.query.photos.findFirst({ where: eq(photos.id, photo.id) }))!.roomId).toBeNull();

		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedRoom(s.db, other.id);
		expect(failure(await run('deleteRoom', s, { roomId: foreign.id }))?.status).toBe(404);
		expect(await s.db.select().from(rooms)).toHaveLength(1);
	});
});

describe('project actions: setRoomArea', () => {
	async function kitchen() {
		const s = await setup();
		const room = await seedRoom(s.db, s.project.id);
		const photo = await seedPhoto(s.db, s.project.id, { roomId: room.id });
		const a = await seedAnnotation(s.db, photo.id, { valueMm: 4000 });
		const b = await seedAnnotation(s.db, photo.id, { valueMm: 3000 });
		const blank = await seedAnnotation(s.db, photo.id, { valueMm: null });
		return { s, room, photo, a, b, blank };
	}
	const stored = async (s: Awaited<ReturnType<typeof setup>>, id: string) =>
		(await s.db.query.rooms.findFirst({ where: eq(rooms.id, id) }))!;

	it('saves two distinct measurements from the room', async () => {
		const { s, room, a, b } = await kitchen();
		expect(await run('setRoomArea', s, { roomId: room.id, areaA: a.id, areaB: b.id })).toBeUndefined();
		expect(await stored(s, room.id)).toMatchObject({ areaAAnnotationId: a.id, areaBAnnotationId: b.id });
	});

	it('clears the selection when both are blank', async () => {
		const { s, room, a, b } = await kitchen();
		await run('setRoomArea', s, { roomId: room.id, areaA: a.id, areaB: b.id });
		await run('setRoomArea', s, { roomId: room.id, areaA: '', areaB: '' });
		expect(await stored(s, room.id)).toMatchObject({ areaAAnnotationId: null, areaBAnnotationId: null });
	});

	type Kitchen = Awaited<ReturnType<typeof kitchen>>;
	it.each([
		['only one chosen', (k: Kitchen) => ({ areaA: k.a.id, areaB: '' }), 'Pick two measurements'],
		['the same one twice', (k: Kitchen) => ({ areaA: k.a.id, areaB: k.a.id }), 'different'],
		['one without a value', (k: Kitchen) => ({ areaA: k.a.id, areaB: k.blank.id }), 'value'],
		['an unknown measurement', (k: Kitchen) => ({ areaA: k.a.id, areaB: 'nope' }), 'belong to this room']
	])('rejects %s', async (_label, pick, message) => {
		const k = await kitchen();
		const result = failure(await run('setRoomArea', k.s, { roomId: k.room.id, ...pick(k) }));
		expect(result?.status).toBe(400);
		expect(result?.error).toContain(message);
		expect(await stored(k.s, k.room.id)).toMatchObject({ areaAAnnotationId: null, areaBAnnotationId: null });
	});

	it('rejects measurements that are on photos in a different room', async () => {
		const { s, room, a } = await kitchen();
		const bedroom = await seedRoom(s.db, s.project.id, 'Bedroom');
		const bedPhoto = await seedPhoto(s.db, s.project.id, { roomId: bedroom.id });
		const elsewhere = await seedAnnotation(s.db, bedPhoto.id);
		const result = failure(await run('setRoomArea', s, { roomId: room.id, areaA: a.id, areaB: elsewhere.id }));
		expect(result?.status).toBe(400);
	});

	it('404s for an unknown room', async () => {
		const { s } = await kitchen();
		expect(failure(await run('setRoomArea', s, { roomId: 'nope', areaA: '', areaB: '' }))?.status).toBe(404);
	});
});

describe('project actions: photos', () => {
	it('deletes a photo and its blob, but only from this project', async () => {
		const s = await setup();
		const photo = await seedPhoto(s.db, s.project.id, { blobKey: 'mine.jpg' });
		await s.storage.put('mine.jpg', new Uint8Array([1]), 'image/jpeg');
		const other = await seedProject(s.db, { name: 'Other' });
		const foreign = await seedPhoto(s.db, other.id, { blobKey: 'theirs.jpg' });
		await s.storage.put('theirs.jpg', new Uint8Array([1]), 'image/jpeg');

		expect(failure(await run('deletePhoto', s, { photoId: foreign.id }))?.status).toBe(404);
		expect(s.blobs.has('theirs.jpg')).toBe(true);

		await run('deletePhoto', s, { photoId: photo.id });
		expect(s.blobs.has('mine.jpg')).toBe(false);
		expect(await s.db.select().from(photos).where(eq(photos.id, photo.id))).toHaveLength(0);
	});
});
