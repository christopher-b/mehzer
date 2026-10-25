import { fail, redirect } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { computeRoomArea } from '#lib/rooms.ts';
import { annotations, photos, projects, rooms } from '#lib/server/db/schema.ts';
import { messages } from '#lib/server/messages.ts';
import { parseName, parseUnitSystem } from '#lib/server/projects.ts';
import { requireUser } from '#lib/server/users.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = requireUser(locals).id;
	const rows = await locals.db
		.select({
			id: projects.id,
			name: projects.name,
			unitSystem: projects.unitSystem,
			createdAt: projects.createdAt,
			photoCount: count(photos.id)
		})
		.from(projects)
		.leftJoin(photos, eq(photos.projectId, projects.id))
		.where(eq(projects.ownerId, userId))
		.groupBy(projects.id)
		.orderBy(desc(projects.createdAt));
	const allRooms = await locals.db
		.select({ room: rooms })
		.from(rooms)
		.innerJoin(projects, eq(projects.id, rooms.projectId))
		.where(eq(projects.ownerId, userId))
		.then((found) => found.map((r) => r.room));
	const allAnnotations = await locals.db
		.select({
			id: annotations.id,
			valueMm: annotations.valueMm,
			roomId: photos.roomId,
			projectId: photos.projectId
		})
		.from(annotations)
		.innerJoin(photos, eq(photos.id, annotations.photoId))
		.innerJoin(projects, eq(projects.id, photos.projectId))
		.where(eq(projects.ownerId, userId));

	return {
		projects: rows.map((project) => {
			const projectRooms = allRooms.filter((r) => r.projectId === project.id);
			const projectAnnotations = allAnnotations.filter((a) => a.projectId === project.id);
			const areas = projectRooms
				.map((room) => computeRoomArea(room, projectAnnotations))
				.filter((area) => area !== null);
			return {
				...project,
				roomCount: projectRooms.length,
				measuredRoomCount: areas.length,
				totalAreaMm2: areas.length > 0 ? areas.reduce((sum, a) => sum + a, 0) : null
			};
		})
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const name = parseName(form.get('name'));
		const unitSystem = parseUnitSystem(form.get('unitSystem'));
		if (!name || !unitSystem) {
			return fail(400, { error: messages.projectFields });
		}
		const [project] = await locals.db
			.insert(projects)
			.values({ name, unitSystem, ownerId: user.id, createdBy: user.id, updatedBy: user.id })
			.returning({ id: projects.id });
		redirect(303, `/p/${project.id}`);
	}
};
