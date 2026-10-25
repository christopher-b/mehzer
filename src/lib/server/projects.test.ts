import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { photos, projects } from './db/schema.ts';
import { deleteProject, getProjectOr404, parseName, parseUnitSystem } from './projects.ts';
import {
	createContext,
	seedAnnotation,
	seedPhoto,
	seedProject,
	seedRoom
} from '../../tests/helpers.ts';

describe('parseName', () => {
	it('trims and returns the name', () => {
		expect(parseName('  Elm St  ')).toBe('Elm St');
	});
	it.each([null, '', '   ', undefined as never])('rejects blank %j', (value) => {
		expect(parseName(value)).toBeNull();
	});
	it('enforces the 100 character default maximum', () => {
		expect(parseName('x'.repeat(100))).toHaveLength(100);
		expect(parseName('x'.repeat(101))).toBeNull();
	});
	it('accepts a custom maximum', () => {
		expect(parseName('abcd', 3)).toBeNull();
		expect(parseName('abc', 3)).toBe('abc');
	});
});

describe('parseUnitSystem', () => {
	it('accepts only imperial and metric', () => {
		expect(parseUnitSystem('imperial')).toBe('imperial');
		expect(parseUnitSystem('metric')).toBe('metric');
		for (const bad of ['', 'cubits', 'Imperial', ' metric', null]) {
			expect(parseUnitSystem(bad)).toBeNull();
		}
	});
});

describe('getProjectOr404', () => {
	it('returns the project, or throws a 404', async () => {
		const { db } = createContext();
		const project = await seedProject(db);
		expect((await getProjectOr404(db, project.id)).id).toBe(project.id);
		await expect(getProjectOr404(db, 'missing')).rejects.toMatchObject({ status: 404 });
	});
});

describe('deleteProject', () => {
	it('removes the project, its rows and its photo blobs, but nothing else', async () => {
		const { db, storage, blobs } = createContext();
		const doomed = await seedProject(db, { name: 'Doomed' });
		const kept = await seedProject(db, { name: 'Kept' });
		const room = await seedRoom(db, doomed.id);
		const p1 = await seedPhoto(db, doomed.id, { blobKey: 'doomed/1.jpg', roomId: room.id });
		const p2 = await seedPhoto(db, doomed.id, { blobKey: 'doomed/2.jpg' });
		const keptPhoto = await seedPhoto(db, kept.id, { blobKey: 'kept/1.jpg' });
		await seedAnnotation(db, p1.id);
		for (const key of ['doomed/1.jpg', 'doomed/2.jpg', 'kept/1.jpg']) {
			await storage.put(key, new Uint8Array([1]), 'image/jpeg');
		}

		await deleteProject(db, storage, doomed.id);

		expect(await db.select().from(projects).where(eq(projects.id, doomed.id))).toHaveLength(0);
		expect(await db.select().from(photos).where(eq(photos.id, p2.id))).toHaveLength(0);
		expect([...blobs.keys()]).toEqual(['kept/1.jpg']);
		expect(await db.select().from(photos).where(eq(photos.id, keptPhoto.id))).toHaveLength(1);
	});

	it('works for a project with no photos', async () => {
		const { db, storage } = createContext();
		const project = await seedProject(db);
		await expect(deleteProject(db, storage, project.id)).resolves.toBeUndefined();
		expect(await db.select().from(projects)).toHaveLength(0);
	});
});
