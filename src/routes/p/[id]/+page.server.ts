import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { computeRoomArea } from '#lib/rooms.ts';
import { annotations, photos, projects, rooms } from '#lib/server/db/schema.ts';
import { formId, formString } from '#lib/server/forms.ts';
import { messages } from '#lib/server/messages.ts';
import { annotationOrder, deletePhoto, numberWithinPhoto, photoOrder, roomOrder } from '#lib/server/photos.ts';
import { setRoomArea } from '#lib/server/rooms.ts';
import { deleteProject, getProjectOr404, parseName, parseUnitSystem } from '#lib/server/projects.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const project = await getProjectOr404(locals.db, params.id);
	const projectPhotos = await locals.db
		.select()
		.from(photos)
		.where(eq(photos.projectId, project.id))
		.orderBy(...photoOrder);
	const projectAnnotationRows = await locals.db
		.select({
			id: annotations.id,
			name: annotations.name,
			valueMm: annotations.valueMm,
			roomId: photos.roomId,
			photoId: annotations.photoId
		})
		.from(annotations)
		.innerJoin(photos, eq(photos.id, annotations.photoId))
		.where(eq(photos.projectId, project.id))
		.orderBy(...photoOrder, ...annotationOrder);
	const projectAnnotations = numberWithinPhoto(projectAnnotationRows);
	const projectRooms = await locals.db
		.select()
		.from(rooms)
		.where(eq(rooms.projectId, project.id))
		.orderBy(...roomOrder);
	return {
		project,
		photos: projectPhotos,
		annotations: projectAnnotations,
		rooms: projectRooms.map((room) => ({
			id: room.id,
			name: room.name,
			areaAAnnotationId: room.areaAAnnotationId,
			areaBAnnotationId: room.areaBAnnotationId,
			areaMm2: computeRoomArea(room, projectAnnotations)
		}))
	};
};

export const actions: Actions = {
	createRoom: async ({ request, locals, params }) => {
		await getProjectOr404(locals.db, params.id);
		const name = parseName((await request.formData()).get('name'));
		if (!name) return fail(400, { error: messages.roomName });
		await locals.db.insert(rooms).values({ projectId: params.id, name });
	},

	renameRoom: async ({ request, locals, params }) => {
		const form = await request.formData();
		const name = parseName(form.get('name'));
		if (!name) return fail(400, { error: messages.roomName });
		const updated = await locals.db
			.update(rooms)
			.set({ name })
			.where(and(eq(rooms.id, formString(form, 'roomId')), eq(rooms.projectId, params.id)))
			.returning({ id: rooms.id });
		if (!updated.length) return fail(404, { error: 'Room not found' });
	},

	deleteRoom: async ({ request, locals, params }) => {
		const form = await request.formData();
		const deleted = await locals.db
			.delete(rooms)
			.where(and(eq(rooms.id, formString(form, 'roomId')), eq(rooms.projectId, params.id)))
			.returning({ id: rooms.id });
		if (!deleted.length) return fail(404, { error: 'Room not found' });
	},

	setRoomArea: async ({ request, locals, params }) => {
		const form = await request.formData();
		const result = await setRoomArea(
			locals.db,
			params.id,
			formString(form, 'roomId'),
			formId(form, 'areaA'),
			formId(form, 'areaB')
		);
		if (result === 'need-two') return fail(400, { error: 'Pick two measurements' });
		if (result === 'same') return fail(400, { error: 'Pick two different measurements' });
		if (result === 'not-in-room') return fail(400, { error: 'Measurements must belong to this room' });
		if (result === 'no-value') return fail(400, { error: 'Both measurements need a value' });
		if (result === 'room-not-found') return fail(404, { error: 'Room not found' });
	},

	update: async ({ request, locals, params }) => {
		await getProjectOr404(locals.db, params.id);
		const form = await request.formData();
		const name = parseName(form.get('name'));
		const unitSystem = parseUnitSystem(form.get('unitSystem'));
		if (!name || !unitSystem) {
			return fail(400, { error: messages.projectFields });
		}
		await locals.db.update(projects).set({ name, unitSystem }).where(eq(projects.id, params.id));
		return { saved: true };
	},

	delete: async ({ locals, params }) => {
		await getProjectOr404(locals.db, params.id);
		await deleteProject(locals.db, locals.storage, params.id);
		redirect(303, '/');
	},

	deletePhoto: async ({ request, locals, params }) => {
		const form = await request.formData();
		const deleted = await deletePhoto(
			locals.db,
			locals.storage,
			params.id,
			formString(form, 'photoId')
		);
		if (!deleted) return fail(404, { error: 'Photo not found' });
	}
};
