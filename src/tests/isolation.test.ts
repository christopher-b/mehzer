import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { annotations, photos, projects, rooms } from '#lib/server/db/schema.ts';
import { actions as homeActions, load as homeLoad } from '../routes/+page.server.ts';
import { actions as projectActions, load as projectLoad } from '../routes/p/[id]/+page.server.ts';
import { actions as photoActions, load as photoLoad } from '../routes/p/[id]/photo/[photoId]/+page.server.ts';
import { GET as exportCsv } from '../routes/p/[id]/export.csv/+server.ts';
import { GET as exportPdf } from '../routes/p/[id]/export.pdf/+server.ts';
import { POST as upload } from '../routes/api/projects/[id]/photos/+server.ts';
import { asUser, call, callLoad, createContext, formData, seedAnnotation, seedPhoto, seedProject, seedRoom, seedUser } from './helpers.ts';

type Handler = (event: never) => unknown;

/** Anna (the test user) owns a project with everything in it; Ben is another signed-in user. */
async function world() {
	const ctx = createContext();
	const ben = await seedUser(ctx.db);
	const project = await seedProject(ctx.db, { name: "Anna's house" });
	const room = await seedRoom(ctx.db, project.id, 'Kitchen');
	const photo = await seedPhoto(ctx.db, project.id, { roomId: room.id });
	const note = await seedAnnotation(ctx.db, photo.id, { name: 'Length', valueMm: 3000 });
	const asBen = asUser(ctx, { id: ben.id, email: ben.email, name: ben.name, role: 'member' });
	return { ctx, ben, project, room, photo, note, asBen };
}

const projectParams = (w: Awaited<ReturnType<typeof world>>) => ({ id: w.project.id });
const photoParams = (w: Awaited<ReturnType<typeof world>>) => ({ id: w.project.id, photoId: w.photo.id });

describe("another user cannot reach someone else's project (every route answers 404)", () => {
	it('the project page and each of its actions', async () => {
		const w = await world();
		await expect(callLoad(projectLoad as Handler, { locals: w.asBen.locals, params: projectParams(w) })).rejects.toMatchObject({ status: 404 });

		const form = { roomId: w.room.id, name: 'Hacked', areaA: w.note.id, areaB: w.note.id, photoId: w.photo.id, unitSystem: 'metric' };
		for (const name of Object.keys(projectActions)) {
			await expect(
				call((projectActions as Record<string, Handler>)[name], { locals: w.asBen.locals, params: projectParams(w), form: formData(form) })
			).rejects.toMatchObject({ status: 404 });
		}
		// nothing changed
		expect((await w.ctx.db.select().from(projects).where(eq(projects.id, w.project.id)))[0].name).toBe("Anna's house");
		expect((await w.ctx.db.select().from(rooms).where(eq(rooms.id, w.room.id)))[0].name).toBe('Kitchen');
		expect(await w.ctx.db.select().from(photos).where(eq(photos.id, w.photo.id))).toHaveLength(1);
	});

	it('the photo page and each of its actions', async () => {
		const w = await world();
		await expect(callLoad(photoLoad as Handler, { locals: w.asBen.locals, params: photoParams(w) })).rejects.toMatchObject({ status: 404 });

		const form = { id: w.note.id, x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9, value: '5', name: 'Hacked', roomId: '' };
		for (const name of Object.keys(photoActions)) {
			await expect(
				call((photoActions as Record<string, Handler>)[name], { locals: w.asBen.locals, params: photoParams(w), form: formData(form) })
			).rejects.toMatchObject({ status: 404 });
		}
		const [note] = await w.ctx.db.select().from(annotations).where(eq(annotations.id, w.note.id));
		expect(note).toMatchObject({ name: 'Length', valueMm: 3000 });
		expect((await w.ctx.db.select().from(photos).where(eq(photos.id, w.photo.id)))[0].roomId).toBe(w.room.id);
	});

	it('uploads, exports and photo files', async () => {
		const w = await world();
		const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
		await expect(
			call(upload as Handler, { locals: w.asBen.locals, params: projectParams(w), form: formData({ file, width: 10, height: 10 }) })
		).rejects.toMatchObject({ status: 404 });
		expect(await w.ctx.db.select().from(photos).where(eq(photos.projectId, w.project.id))).toHaveLength(1);

		for (const handler of [exportCsv, exportPdf]) {
			await expect(call(handler as Handler, { locals: w.asBen.locals, params: projectParams(w) })).rejects.toMatchObject({ status: 404 });
		}
	});

	it("the home page lists only your own projects and counts only your own rooms", async () => {
		const w = await world();
		const benProject = await seedProject(w.ctx.db, { name: "Ben's house", ownerId: w.ben.id });
		await seedRoom(w.ctx.db, benProject.id, 'Hall');

		const bens = await callLoad<{ projects: { name: string; roomCount: number; photoCount: number }[] }>(homeLoad as Handler, { locals: w.asBen.locals });
		expect(bens.projects.map((p) => p.name)).toEqual(["Ben's house"]);
		expect(bens.projects[0]).toMatchObject({ roomCount: 1, photoCount: 0 });

		const annas = await callLoad<{ projects: { name: string }[] }>(homeLoad as Handler, { locals: w.ctx.locals });
		expect(annas.projects.map((p) => p.name)).toEqual(["Anna's house"]);
	});
});

describe('who made what', () => {
	it('records the creator and last editor of what a user adds or changes', async () => {
		const w = await world();
		const created = await call(homeActions.create as Handler, { locals: w.asBen.locals, form: formData({ name: 'New', unitSystem: 'metric' }) }).catch((e) => e);
		expect(created).toMatchObject({ status: 303 });
		const [mine] = await w.ctx.db.select().from(projects).where(eq(projects.name, 'New'));
		expect(mine).toMatchObject({ ownerId: w.ben.id, createdBy: w.ben.id, updatedBy: w.ben.id });

		await call(projectActions.createRoom as Handler, { locals: w.asBen.locals, params: { id: mine.id }, form: formData({ name: 'Bath' }) });
		const [bath] = await w.ctx.db.select().from(rooms).where(eq(rooms.projectId, mine.id));
		expect(bath).toMatchObject({ createdBy: w.ben.id, updatedBy: w.ben.id });
	});

	it('records the editor of a measurement and the creator of one', async () => {
		const w = await world();
		await call(photoActions.update as Handler, { locals: w.ctx.locals, params: photoParams(w), form: formData({ id: w.note.id, value: "20'", name: 'Edited' }) });
		const [note] = await w.ctx.db.select().from(annotations).where(eq(annotations.id, w.note.id));
		expect(note.updatedBy).toBe(w.ctx.locals.user!.id);

		const result = (await call(photoActions.create as Handler, { locals: w.ctx.locals, params: photoParams(w), form: formData({ x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.2, value: "10'" }) })) as { id: string };
		const [made] = await w.ctx.db.select().from(annotations).where(eq(annotations.id, result.id));
		expect(made).toMatchObject({ createdBy: w.ctx.locals.user!.id, updatedBy: w.ctx.locals.user!.id });
	});
});
