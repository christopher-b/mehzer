import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { annotations, photos, projects, rooms } from '#lib/server/db/schema.ts';
import { createTestDb, seedAnnotation, seedPhoto, seedProject, seedRoom } from './helpers.ts';

describe('database rules (foreign keys, defaults, migrations)', () => {
	it('applies every migration to an empty database', () => {
		expect(() => createTestDb()).not.toThrow();
	});

	it('fills in ids, defaults and timestamps', async () => {
		const db = createTestDb();
		const project = await seedProject(db, { unitSystem: undefined });
		expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(project.unitSystem).toBe('imperial');
		expect(project.createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
	});

	it('deleting a room sends its photos to No room and keeps photos and measurements', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const photo = await seedPhoto(db, project.id, { roomId: room.id });
		await seedAnnotation(db, photo.id);

		await db.delete(rooms).where(eq(rooms.id, room.id));

		const after = (await db.query.photos.findFirst({ where: eq(photos.id, photo.id) }))!;
		expect(after.roomId).toBeNull();
		expect(await db.select().from(annotations).where(eq(annotations.photoId, photo.id))).toHaveLength(1);
	});

	it('deleting a photo deletes its measurements and clears areas that used them', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const photo = await seedPhoto(db, project.id, { roomId: room.id });
		const a = await seedAnnotation(db, photo.id);
		const b = await seedAnnotation(db, photo.id);
		await db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, room.id));

		await db.delete(photos).where(eq(photos.id, photo.id));

		expect(await db.select().from(annotations)).toHaveLength(0);
		const after = (await db.query.rooms.findFirst({ where: eq(rooms.id, room.id) }))!;
		expect(after.areaAAnnotationId).toBeNull();
		expect(after.areaBAnnotationId).toBeNull();
	});

	it('deleting one measurement clears only the area selection that used it', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		const room = await seedRoom(db, project.id);
		const photo = await seedPhoto(db, project.id, { roomId: room.id });
		const a = await seedAnnotation(db, photo.id);
		const b = await seedAnnotation(db, photo.id);
		await db.update(rooms).set({ areaAAnnotationId: a.id, areaBAnnotationId: b.id }).where(eq(rooms.id, room.id));

		await db.delete(annotations).where(eq(annotations.id, a.id));

		const after = (await db.query.rooms.findFirst({ where: eq(rooms.id, room.id) }))!;
		expect(after.areaAAnnotationId).toBeNull();
		expect(after.areaBAnnotationId).toBe(b.id);
	});

	it('deleting a project removes its rooms, photos and measurements, but not other projects', async () => {
		const db = createTestDb();
		const doomed = await seedProject(db, { name: 'Doomed' });
		const kept = await seedProject(db, { name: 'Kept' });
		for (const project of [doomed, kept]) {
			const room = await seedRoom(db, project.id);
			const photo = await seedPhoto(db, project.id, { roomId: room.id });
			await seedAnnotation(db, photo.id);
		}

		await db.delete(projects).where(eq(projects.id, doomed.id));

		expect(await db.select().from(projects)).toHaveLength(1);
		expect(await db.select().from(rooms)).toHaveLength(1);
		expect(await db.select().from(photos)).toHaveLength(1);
		expect(await db.select().from(annotations)).toHaveLength(1);
	});

	it('refuses orphans: a photo needs a real project, a measurement a real photo', async () => {
		const db = createTestDb();
		await expect(seedPhoto(db, 'no-such-project')).rejects.toThrow();
		await expect(seedAnnotation(db, 'no-such-photo')).rejects.toThrow();
	});

	it('requires unique blob keys', async () => {
		const db = createTestDb();
		const project = await seedProject(db);
		await seedPhoto(db, project.id, { blobKey: 'same.jpg' });
		await expect(seedPhoto(db, project.id, { blobKey: 'same.jpg' })).rejects.toThrow();
	});
});
