import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { annotations, rooms } from '#lib/server/db/schema.ts';
import { parseAnnotationFields, parseCoords } from '#lib/server/annotations.ts';
import { formId, formString } from '#lib/server/forms.ts';
import { messages } from '#lib/server/messages.ts';
import {
	deletePhoto,
	getPhotoNeighbours,
	getPhotoOr404,
	annotationOrder,
	numberWithinPhoto,
	roomOrder,
	setPhotoRoom
} from '#lib/server/photos.ts';
import type { Actions, PageServerLoad } from './$types';

function annotationWhere(id: string, photoId: string) {
	return and(eq(annotations.id, id), eq(annotations.photoId, photoId));
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { project, photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
	const [photoAnnotations, projectRooms, neighbours] = await Promise.all([
		locals.db
			.select()
			.from(annotations)
			.where(eq(annotations.photoId, photo.id))
			.orderBy(...annotationOrder),
		locals.db
			.select({ id: rooms.id, name: rooms.name })
			.from(rooms)
			.where(eq(rooms.projectId, project.id))
			.orderBy(...roomOrder),
		getPhotoNeighbours(locals.db, project.id, photo)
	]);
	return { project, photo, annotations: numberWithinPhoto(photoAnnotations), rooms: projectRooms, neighbours };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const { project, photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
		const form = await request.formData();
		const coords = parseCoords(form);
		if (!coords) return fail(400, { error: 'Invalid line endpoints' });
		const parsed = parseAnnotationFields(project, form);
		if (!parsed.ok) return parsed.failure;
		const { fields } = parsed;

		const [created] = await locals.db
			.insert(annotations)
			.values({ photoId: photo.id, ...coords, ...fields })
			.returning({ id: annotations.id });
		return { id: created.id };
	},

	update: async ({ request, locals, params }) => {
		const { project, photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
		const form = await request.formData();
		const parsed = parseAnnotationFields(project, form);
		if (!parsed.ok) return parsed.failure;
		const { fields } = parsed;

		const updated = await locals.db
			.update(annotations)
			.set(fields)
			.where(annotationWhere(formString(form, 'id'), photo.id))
			.returning({ id: annotations.id });
		if (!updated.length) return fail(404, { error: messages.annotationNotFound });
		return { id: updated[0].id };
	},

	deletePhoto: async ({ locals, params }) => {
		const { photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
		await deletePhoto(locals.db, locals.storage, params.id, photo.id);
		redirect(303, `/p/${params.id}`);
	},

	setRoom: async ({ request, locals, params }) => {
		const { photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
		const form = await request.formData();
		const result = await setPhotoRoom(
			locals.db,
			params.id,
			photo.id,
			formId(form, 'roomId')
		);
		if (result === 'unknown-room') return fail(400, { error: 'Unknown room' });
		if (result === 'not-found') return fail(404, { error: 'Photo not found' });
	},

	move: async ({ request, locals, params }) => {
		const { photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
		const form = await request.formData();
		const coords = parseCoords(form);
		if (!coords) return fail(400, { error: 'Invalid line endpoints' });

		const updated = await locals.db
			.update(annotations)
			.set(coords)
			.where(annotationWhere(formString(form, 'id'), photo.id))
			.returning({ id: annotations.id });
		if (!updated.length) return fail(404, { error: messages.annotationNotFound });
	},

	delete: async ({ request, locals, params }) => {
		const { photo } = await getPhotoOr404(locals.db, params.id, params.photoId);
		const form = await request.formData();
		const deleted = await locals.db
			.delete(annotations)
			.where(annotationWhere(formString(form, 'id'), photo.id))
			.returning({ id: annotations.id });
		if (!deleted.length) return fail(404, { error: messages.annotationNotFound });
	}
};
