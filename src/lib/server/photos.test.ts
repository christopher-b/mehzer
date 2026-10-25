import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { annotations, photos, rooms } from './db/schema.ts';
import { deletePhoto, getPhotoNeighbours, getPhotoOr404, numberWithinPhoto, setPhotoRoom } from './photos.ts';
import {
	createContext,
	createTestDb,
	seedAnnotation,
	seedPhoto,
	seedProject,
	seedRoom,
	TEST_USER
} from '../../tests/helpers.ts';

const roomOf = async (db: ReturnType<typeof createTestDb>, photoId: string) =>
	(await db.query.photos.findFirst({ where: eq(photos.id, photoId) }))!.roomId;

describe('setPhotoRoom', () => {
	it('moves a photo into a room and back to No room', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const photo = await seedPhoto(db, project.id);

		expect(await setPhotoRoom(db, project.id, photo.id, room.id)).toBe('ok');
		expect(await roomOf(db, photo.id)).toBe(room.id);

		expect(await setPhotoRoom(db, project.id, photo.id, null)).toBe('ok');
		expect(await roomOf(db, photo.id)).toBeNull();
	});

	it("rejects a room from another project and leaves the photo alone", async () => {
		const db = createTestDb();
		const mine = await seedProject(db);
		const other = await seedProject(db, { name: 'Other' });
		const foreignRoom = await seedRoom(db, other.id);
		const photo = await seedPhoto(db, mine.id);

		expect(await setPhotoRoom(db, mine.id, photo.id, foreignRoom.id)).toBe('unknown-room');
		expect(await setPhotoRoom(db, mine.id, photo.id, 'no-such-room')).toBe('unknown-room');
		expect(await roomOf(db, photo.id)).toBeNull();
	});

	it("won't move a photo from another project or one that doesn't exist", async () => {
		const db = createTestDb();
		const mine = await seedProject(db);
		const other = await seedProject(db, { name: 'Other' });
		const room = await seedRoom(db, mine.id);
		const foreignPhoto = await seedPhoto(db, other.id);

		expect(await setPhotoRoom(db, mine.id, foreignPhoto.id, room.id)).toBe('not-found');
		expect(await setPhotoRoom(db, mine.id, 'nope', room.id)).toBe('not-found');
		expect(await roomOf(db, foreignPhoto.id)).toBeNull();
	});

	it("clears the room area that used the moved photo's measurements", async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const kitchen = await seedRoom(db, project.id, 'Kitchen');
		const photo = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const length = await seedAnnotation(db, photo.id, { valueMm: 4000 });
		const width = await seedAnnotation(db, photo.id, { valueMm: 3000 });
		await db
			.update(rooms)
			.set({ areaAAnnotationId: length.id, areaBAnnotationId: width.id })
			.where(eq(rooms.id, kitchen.id));

		const bedroom = await seedRoom(db, project.id, 'Bedroom');
		await setPhotoRoom(db, project.id, photo.id, bedroom.id);

		const after = (await db.query.rooms.findFirst({ where: eq(rooms.id, kitchen.id) }))!;
		expect(after.areaAAnnotationId).toBeNull();
		expect(after.areaBAnnotationId).toBeNull();
	});

	it("clears the area when only one of its two measurements is on the moved photo", async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const kitchen = await seedRoom(db, project.id);
		const photo1 = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const photo2 = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const a = await seedAnnotation(db, photo1.id);
		const b = await seedAnnotation(db, photo2.id);
		await db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, kitchen.id));

		await setPhotoRoom(db, project.id, photo2.id, null);

		const after = (await db.query.rooms.findFirst({ where: eq(rooms.id, kitchen.id) }))!;
		expect(after.areaAAnnotationId).toBeNull();
		expect(after.areaBAnnotationId).toBeNull();
	});

	it("leaves other rooms' areas untouched", async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const kitchen = await seedRoom(db, project.id, 'Kitchen');
		const bedroom = await seedRoom(db, project.id, 'Bedroom');
		const kitchenPhoto = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const bedroomPhoto = await seedPhoto(db, project.id, { roomId: bedroom.id });
		const k1 = await seedAnnotation(db, kitchenPhoto.id);
		const k2 = await seedAnnotation(db, kitchenPhoto.id);
		const b1 = await seedAnnotation(db, bedroomPhoto.id);
		const b2 = await seedAnnotation(db, bedroomPhoto.id);
		await db.update(rooms).set({ areaAAnnotationId: k1.id, areaBAnnotationId: k2.id }).where(eq(rooms.id, kitchen.id));
		await db.update(rooms).set({ areaAAnnotationId: b1.id, areaBAnnotationId: b2.id }).where(eq(rooms.id, bedroom.id));

		await setPhotoRoom(db, project.id, kitchenPhoto.id, null);

		const kitchenAfter = (await db.query.rooms.findFirst({ where: eq(rooms.id, kitchen.id) }))!;
		const bedroomAfter = (await db.query.rooms.findFirst({ where: eq(rooms.id, bedroom.id) }))!;
		expect(kitchenAfter.areaAAnnotationId).toBeNull();
		expect(bedroomAfter.areaAAnnotationId).toBe(b1.id);
		expect(bedroomAfter.areaBAnnotationId).toBe(b2.id);
	});

	it('does not touch areas when the photo has no measurements', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const roomPhoto = await seedPhoto(db, project.id, { roomId: room.id });
		const a = await seedAnnotation(db, roomPhoto.id);
		const b = await seedAnnotation(db, roomPhoto.id);
		await db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, room.id));
		const emptyPhoto = await seedPhoto(db, project.id);

		await setPhotoRoom(db, project.id, emptyPhoto.id, room.id);

		const after = (await db.query.rooms.findFirst({ where: eq(rooms.id, room.id) }))!;
		expect(after.areaAAnnotationId).toBe(a.id);
	});
});

describe('deletePhoto', () => {
	it('deletes the photo row, its stored file and its measurements', async () => {
		const { db, storage, blobs } = createContext();
		const project = await seedProject(db);
		const photo = await seedPhoto(db, project.id, { blobKey: 'mine.jpg' });
		await storage.put('mine.jpg', new Uint8Array([1]), 'image/jpeg');
		await seedAnnotation(db, photo.id);
		await seedAnnotation(db, photo.id);

		expect(await deletePhoto(db, storage, project.id, photo.id)).toBe(true);

		expect(await db.select().from(photos)).toHaveLength(0);
		expect(await db.select().from(annotations)).toHaveLength(0);
		expect(blobs.has('mine.jpg')).toBe(false);
	});

	it('clears a room area that used the deleted photo\'s measurements', async () => {
		const { db, storage } = createContext();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const photo = await seedPhoto(db, project.id, { roomId: room.id });
		const a = await seedAnnotation(db, photo.id);
		const b = await seedAnnotation(db, photo.id);
		await db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, room.id));

		await deletePhoto(db, storage, project.id, photo.id);

		const after = (await db.query.rooms.findFirst({ where: eq(rooms.id, room.id) }))!;
		expect(after.areaAAnnotationId).toBeNull();
		expect(after.areaBAnnotationId).toBeNull();
	});

	it("won't delete a photo from another project, or one that doesn't exist, and keeps its file", async () => {
		const { db, storage, blobs } = createContext();
		const mine = await seedProject(db);
		const other = await seedProject(db, { name: 'Other' });
		const foreign = await seedPhoto(db, other.id, { blobKey: 'theirs.jpg' });
		await storage.put('theirs.jpg', new Uint8Array([1]), 'image/jpeg');

		expect(await deletePhoto(db, storage, mine.id, foreign.id)).toBe(false);
		expect(await deletePhoto(db, storage, mine.id, 'nope')).toBe(false);
		expect(await db.select().from(photos)).toHaveLength(1);
		expect(blobs.has('theirs.jpg')).toBe(true);
	});

	it('leaves other photos and their measurements alone', async () => {
		const { db, storage } = createContext();
		const project = await seedProject(db);
		const doomed = await seedPhoto(db, project.id);
		const kept = await seedPhoto(db, project.id);
		await seedAnnotation(db, doomed.id);
		await seedAnnotation(db, kept.id);

		await deletePhoto(db, storage, project.id, doomed.id);

		expect(await db.select().from(photos)).toHaveLength(1);
		expect((await db.select().from(annotations))[0].photoId).toBe(kept.id);
	});
});

describe('getPhotoNeighbours', () => {
	const ids = (n: { previous: { id: string } | null; next: { id: string } | null }) => [
		n.previous?.id ?? null,
		n.next?.id ?? null
	];

	it('finds the previous and next photo in the same room, oldest first', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const t = (s: number) => new Date(1_700_000_000_000 + s * 1000);
		const a = await seedPhoto(db, project.id, { roomId: room.id, createdAt: t(0) });
		const b = await seedPhoto(db, project.id, { roomId: room.id, createdAt: t(10) });
		const c = await seedPhoto(db, project.id, { roomId: room.id, createdAt: t(20) });

		expect(await getPhotoNeighbours(db, project.id, a)).toMatchObject({ position: 1, total: 3, previous: null, next: { id: b.id } });
		expect(await getPhotoNeighbours(db, project.id, b)).toMatchObject({ position: 2, total: 3, previous: { id: a.id }, next: { id: c.id } });
		expect(await getPhotoNeighbours(db, project.id, c)).toMatchObject({ position: 3, total: 3, previous: { id: b.id }, next: null });
	});

	it('orders by created time, not by insertion order', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const later = await seedPhoto(db, project.id, { createdAt: new Date(1_700_000_100_000) });
		const earlier = await seedPhoto(db, project.id, { createdAt: new Date(1_700_000_000_000) });

		expect(ids(await getPhotoNeighbours(db, project.id, earlier))).toEqual([null, later.id]);
		expect(ids(await getPhotoNeighbours(db, project.id, later))).toEqual([earlier.id, null]);
	});

	it('keeps upload order for photos with the same timestamp (whole-second resolution)', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const same = new Date(1_700_000_000_000);
		const all = [];
		for (let i = 0; i < 6; i++) all.push(await seedPhoto(db, project.id, { createdAt: same }));

		for (let i = 0; i < all.length; i++) {
			const n = await getPhotoNeighbours(db, project.id, all[i]);
			expect(n.position).toBe(i + 1);
			expect(ids(n)).toEqual([all[i - 1]?.id ?? null, all[i + 1]?.id ?? null]);
		}
	});

	it('only looks at photos in the same room, and "No room" is its own group', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const kitchen = await seedRoom(db, project.id, 'Kitchen');
		const bedroom = await seedRoom(db, project.id, 'Bedroom');
		const k1 = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const b1 = await seedPhoto(db, project.id, { roomId: bedroom.id });
		const n1 = await seedPhoto(db, project.id);
		const k2 = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const n2 = await seedPhoto(db, project.id);

		expect(ids(await getPhotoNeighbours(db, project.id, k1))).toEqual([null, k2.id]);
		expect(await getPhotoNeighbours(db, project.id, b1)).toMatchObject({ total: 1, previous: null, next: null });
		expect(ids(await getPhotoNeighbours(db, project.id, n1))).toEqual([null, n2.id]);
		expect((await getPhotoNeighbours(db, project.id, n2)).total).toBe(2);
	});

	it("ignores other projects' photos", async () => {
		const db = createTestDb();
		const mine = await seedProject(db);
		const other = await seedProject(db, { name: 'Other' });
		const a = await seedPhoto(db, mine.id);
		await seedPhoto(db, other.id);
		await seedPhoto(db, other.id);

		expect(await getPhotoNeighbours(db, mine.id, a)).toMatchObject({ position: 1, total: 1, previous: null, next: null });
	});

	it('returns blob keys so the next/previous images can be preloaded', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const a = await seedPhoto(db, project.id, { blobKey: 'one.jpg' });
		await seedPhoto(db, project.id, { blobKey: 'two.jpg' });
		expect((await getPhotoNeighbours(db, project.id, a)).next).toMatchObject({ blobKey: 'two.jpg' });
	});

	it('follows a photo that moves to another room', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const a = await seedPhoto(db, project.id, { roomId: room.id });
		const b = await seedPhoto(db, project.id, { roomId: room.id });
		expect((await getPhotoNeighbours(db, project.id, a)).total).toBe(2);

		await setPhotoRoom(db, project.id, b.id, null);

		expect((await getPhotoNeighbours(db, project.id, a)).total).toBe(1);
		expect((await getPhotoNeighbours(db, project.id, { id: b.id, roomId: null })).total).toBe(1);
	});

	it('degrades safely for a photo that is not in the list', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		await seedPhoto(db, project.id);
		expect(await getPhotoNeighbours(db, project.id, { id: 'ghost', roomId: null })).toEqual({
			position: 1,
			total: 1,
			previous: null,
			next: null
		});
	});
});

describe('getPhotoOr404', () => {
	it('returns the project and photo', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const photo = await seedPhoto(db, project.id);
		const found = await getPhotoOr404(db, TEST_USER.id, project.id, photo.id);
		expect(found.project.id).toBe(project.id);
		expect(found.photo.id).toBe(photo.id);
	});

	it('404s for a missing project, a missing photo, or a photo in another project', async () => {
		const db = createTestDb();
		const mine = await seedProject(db);
		const other = await seedProject(db, { name: 'Other' });
		const photo = await seedPhoto(db, other.id);
		await expect(getPhotoOr404(db, TEST_USER.id, 'nope', photo.id)).rejects.toMatchObject({ status: 404 });
		await expect(getPhotoOr404(db, TEST_USER.id, mine.id, 'nope')).rejects.toMatchObject({ status: 404 });
		await expect(getPhotoOr404(db, TEST_USER.id, mine.id, photo.id)).rejects.toMatchObject({ status: 404 });
	});
});

describe('numberWithinPhoto', () => {
	it('numbers rows per photo, in the order given', () => {
		const rows = [
			{ id: 'a', photoId: 'p1' },
			{ id: 'b', photoId: 'p1' },
			{ id: 'c', photoId: 'p2' },
			{ id: 'd', photoId: 'p1' }
		];
		expect(numberWithinPhoto(rows).map((r) => r.number)).toEqual([1, 2, 1, 3]);
	});
});
