import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { projects, rooms } from '#lib/server/db/schema.ts';
import type { PageData } from '../routes/$types';
import { actions, load } from '../routes/+page.server.ts';
import { call, callLoad, createContext, failure, formData, seedAnnotation, seedPhoto, seedProject, seedRoom } from './helpers.ts';

describe('home page', () => {
	it('lists projects newest first with their photo counts', async () => {
		const { db, locals } = createContext();
		const older = await seedProject(db, { name: 'Older', createdAt: new Date('2026-01-01') });
		const newer = await seedProject(db, { name: 'Newer', unitSystem: 'metric', createdAt: new Date('2026-06-01') });
		await seedPhoto(db, older.id);
		await seedPhoto(db, older.id);

		const data = await callLoad<PageData>(
			load,
			{ locals }
		);

		expect(data.projects.map((p) => p.name)).toEqual(['Newer', 'Older']);
		expect(data.projects.find((p) => p.id === older.id)?.photoCount).toBe(2);
		expect(data.projects.find((p) => p.id === newer.id)).toMatchObject({ photoCount: 0, unitSystem: 'metric' });
	});

	it('counts rooms and totals the areas that have been calculated', async () => {
		const { db, locals } = createContext();
		const project = await seedProject(db, { name: 'Elm St' });
		const other = await seedProject(db, { name: 'Other' });
		const kitchen = await seedRoom(db, project.id, 'Kitchen');
		await seedRoom(db, project.id, 'Bath');
		await seedRoom(db, other.id, 'Hall');
		const photo = await seedPhoto(db, project.id, { roomId: kitchen.id });
		const length = await seedAnnotation(db, photo.id, { valueMm: 4000 });
		const width = await seedAnnotation(db, photo.id, { valueMm: 3000 });
		await db.update(rooms).set({ areaAAnnotationId: length.id, areaBAnnotationId: width.id }).where(eq(rooms.id, kitchen.id));

		const data = await callLoad<PageData>(load, { locals });
		const elm = data.projects.find((p) => p.id === project.id);
		expect(elm).toMatchObject({ roomCount: 2, measuredRoomCount: 1, totalAreaMm2: 12_000_000 });
		expect(data.projects.find((p) => p.id === other.id)).toMatchObject({
			roomCount: 1,
			measuredRoomCount: 0,
			totalAreaMm2: null
		});
	});

	it('is empty with no projects', async () => {
		const { locals } = createContext();
		expect((await callLoad<PageData>(load, { locals })).projects).toEqual([]);
	});

	it('creates a project and redirects to it', async () => {
		const { db, locals } = createContext();
		const redirect = (await call(actions.create, {
			locals,
			form: formData({ name: '  12 Elm St ', unitSystem: 'metric' })
		}).catch((e) => e)) as { status: number; location: string };

		const rows = await db.select().from(projects);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: '12 Elm St', unitSystem: 'metric' });
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/p/${rows[0].id}`);
	});

	it.each([
		['blank name', { name: '', unitSystem: 'imperial' }],
		['bad units', { name: 'X', unitSystem: 'cubits' }],
		['missing units', { name: 'X' }],
		['over-long name', { name: 'x'.repeat(101), unitSystem: 'imperial' }]
	])('rejects %s without creating anything', async (_l, fields) => {
		const { db, locals } = createContext();
		const result = failure(await call(actions.create, { locals, form: formData(fields) }));
		expect(result?.status).toBe(400);
		expect(await db.select().from(projects).where(eq(projects.name, fields.name))).toHaveLength(0);
	});
});
