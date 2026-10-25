import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { rooms } from './db/schema.ts';
import { findRoomInProject, setRoomArea } from './rooms.ts';
import { createTestDb, seedAnnotation, seedPhoto, seedProject, seedRoom } from '../../tests/helpers.ts';

describe('findRoomInProject', () => {
	it('finds a room in its own project only', async () => {
		const db = createTestDb();
		const mine = await seedProject(db);
		const other = await seedProject(db, { name: 'Other' });
		const room = await seedRoom(db, mine.id);

		expect((await findRoomInProject(db, mine.id, room.id))?.id).toBe(room.id);
		expect(await findRoomInProject(db, other.id, room.id)).toBeUndefined();
		expect(await findRoomInProject(db, mine.id, 'nope')).toBeUndefined();
	});
});

describe('setRoomArea', () => {
	async function setup() {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const photo = await seedPhoto(db, project.id, { roomId: room.id });
		const a = await seedAnnotation(db, photo.id);
		const b = await seedAnnotation(db, photo.id);
		const blank = await seedAnnotation(db, photo.id, { valueMm: null });
		const loosePhoto = await seedPhoto(db, project.id);
		const loose = await seedAnnotation(db, loosePhoto.id);
		const stored = async () =>
			(await db.query.rooms.findFirst({ where: eq(rooms.id, room.id) }))!;
		return { db, project, room, a, b, blank, loose, stored };
	}

	it('stores two measurements and clears them again', async () => {
		const s = await setup();
		expect(await setRoomArea(s.db, s.project.id, s.room.id, s.a.id, s.b.id)).toBe('ok');
		expect(await s.stored()).toMatchObject({ areaAAnnotationId: s.a.id, areaBAnnotationId: s.b.id });
		expect(await setRoomArea(s.db, s.project.id, s.room.id, null, null)).toBe('ok');
		expect(await s.stored()).toMatchObject({ areaAAnnotationId: null, areaBAnnotationId: null });
	});

	it('rejects bad choices and leaves the room alone', async () => {
		const s = await setup();
		const run = (x: string | null, y: string | null) => setRoomArea(s.db, s.project.id, s.room.id, x, y);
		expect(await run(s.a.id, null)).toBe('need-two');
		expect(await run(s.a.id, s.a.id)).toBe('same');
		expect(await run(s.a.id, s.blank.id)).toBe('no-value');
		expect(await run(s.a.id, s.loose.id)).toBe('not-in-room');
		expect(await run(s.a.id, 'nope')).toBe('not-in-room');
		expect(await s.stored()).toMatchObject({ areaAAnnotationId: null, areaBAnnotationId: null });
	});

	it('reports a room that is not in the project', async () => {
		const s = await setup();
		expect(await setRoomArea(s.db, s.project.id, 'nope', null, null)).toBe('room-not-found');
	});
});
