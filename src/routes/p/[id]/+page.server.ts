import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { computeRoomArea } from '#lib/rooms.ts';
import { annotations, photos, projects, rooms, users } from '#lib/server/db/schema.ts';
import { formId, formString, parseName, parseUnitSystem } from '#lib/server/forms.ts';
import { messages } from '#lib/server/messages.ts';
import { annotationOrder, deletePhoto, numberWithinPhoto, photoOrder, roomOrder } from '#lib/server/photos.ts';
import { roomAreaFailures, setRoomArea } from '#lib/server/rooms.ts';
import { handOver, listGuests, removeGuest, shareFailures, shareProject, sharingMessages } from '#lib/server/sharing.ts';
import { deleteProject, getProjectOr404 } from '#lib/server/projects.ts';
import { requireUser } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { role, ...project } = await getProjectOr404(locals.db, requireUser(locals).id, params.id);
	const ownerName =
		role === 'owner' || !project.ownerId
			? null
			: ((await locals.db.select({ name: users.name }).from(users).where(eq(users.id, project.ownerId)))[0]?.name ?? null);
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
		access: { role, ownerName },
		// Who the project is shared with: only the owner manages that, so only the owner gets the list.
		guests: role === 'owner' ? await listGuests(locals.db, project.id) : [],
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
		const user = requireUser(locals);
		await getProjectOr404(locals.db, user.id, params.id);
		const name = parseName((await request.formData()).get('name'));
		if (!name) return fail(400, { error: messages.roomName });
		await locals.db.insert(rooms).values({ projectId: params.id, name, createdBy: user.id, updatedBy: user.id });
	},

	renameRoom: async ({ request, locals, params }) => {
		const user = requireUser(locals);
		await getProjectOr404(locals.db, user.id, params.id);
		const form = await request.formData();
		const name = parseName(form.get('name'));
		if (!name) return fail(400, { error: messages.roomName });
		const updated = await locals.db
			.update(rooms)
			.set({ name, updatedBy: user.id })
			.where(and(eq(rooms.id, formString(form, 'roomId')), eq(rooms.projectId, params.id)))
			.returning({ id: rooms.id });
		if (!updated.length) return fail(404, { error: 'Room not found' });
	},

	deleteRoom: async ({ request, locals, params }) => {
		await getProjectOr404(locals.db, requireUser(locals).id, params.id);
		const form = await request.formData();
		const deleted = await locals.db
			.delete(rooms)
			.where(and(eq(rooms.id, formString(form, 'roomId')), eq(rooms.projectId, params.id)))
			.returning({ id: rooms.id });
		if (!deleted.length) return fail(404, { error: 'Room not found' });
	},

	setRoomArea: async ({ request, locals, params }) => {
		await getProjectOr404(locals.db, requireUser(locals).id, params.id);
		const form = await request.formData();
		const result = await setRoomArea(
			locals.db,
			params.id,
			formString(form, 'roomId'),
			formId(form, 'areaA'),
			formId(form, 'areaB')
		);
		if (result !== 'ok') {
			const [status, message] = roomAreaFailures[result];
			return fail(status, { error: message });
		}
	},

	update: async ({ request, locals, params }) => {
		const user = requireUser(locals);
		await getProjectOr404(locals.db, user.id, params.id);
		const form = await request.formData();
		const name = parseName(form.get('name'));
		const unitSystem = parseUnitSystem(form.get('unitSystem'));
		if (!name || !unitSystem) {
			return fail(400, { error: messages.projectFields });
		}
		await locals.db.update(projects).set({ name, unitSystem, updatedBy: user.id }).where(eq(projects.id, params.id));
		return { saved: true };
	},

	delete: async ({ locals, params }) => {
		await getProjectOr404(locals.db, requireUser(locals).id, params.id, 'owner');
		await deleteProject(locals.db, locals.storage, params.id);
		redirect(303, '/');
	},

	share: async ({ request, locals, params }) => {
		const user = requireUser(locals);
		const project = await getProjectOr404(locals.db, user.id, params.id, 'owner');
		const result = await shareProject(locals.db, project, user.id, (await request.formData()).get('email'));
		if (result !== 'shared') {
			const [status, message] = shareFailures[result];
			return fail(status, { error: message });
		}
		return { shared: true };
	},

	unshare: async ({ request, locals, params }) => {
		await getProjectOr404(locals.db, requireUser(locals).id, params.id, 'owner');
		const removed = await removeGuest(locals.db, params.id, formString(await request.formData(), 'userId'));
		if (!removed) return fail(404, { error: 'That person is not on this project' });
	},

	handOver: async ({ request, locals, params }) => {
		const project = await getProjectOr404(locals.db, requireUser(locals).id, params.id, 'owner');
		const done = handOver(locals.db, project, formString(await request.formData(), 'userId'));
		if (!done) return fail(404, { error: 'That person is not on this project' });
	},

	leave: async ({ locals, params }) => {
		const user = requireUser(locals);
		const project = await getProjectOr404(locals.db, user.id, params.id);
		if (project.role === 'owner') return fail(400, { error: sharingMessages.ownerCannotLeave });
		await removeGuest(locals.db, params.id, user.id);
		redirect(303, '/');
	},

	deletePhoto: async ({ request, locals, params }) => {
		await getProjectOr404(locals.db, requireUser(locals).id, params.id);
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
