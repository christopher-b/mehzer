import { and, eq } from 'drizzle-orm';
import type { Db } from './db/types.ts';
import { annotations, photos, rooms } from './db/schema.ts';

/** The room, if it exists and belongs to this project. */
export async function findRoomInProject(db: Db, projectId: string, roomId: string) {
	return db.query.rooms.findFirst({
		where: and(eq(rooms.id, roomId), eq(rooms.projectId, projectId))
	});
}

export type SetRoomAreaResult =
	| 'ok'
	| 'need-two'
	| 'same'
	| 'not-in-room'
	| 'no-value'
	| 'room-not-found';

export const roomAreaFailures: Record<Exclude<SetRoomAreaResult, 'ok'>, [status: number, message: string]> = {
	'need-two': [400, 'Pick two measurements'],
	same: [400, 'Pick two different measurements'],
	'not-in-room': [400, 'Measurements must belong to this room'],
	'no-value': [400, 'Both measurements need a value'],
	'room-not-found': [404, 'Room not found']
};

/**
 * Choose the two measurements (length and width) a room's area is computed from, or clear the choice
 * when both are null. Both must be measurements on this room's photos and have a value.
 */
export async function setRoomArea(
	db: Db,
	projectId: string,
	roomId: string,
	aId: string | null,
	bId: string | null
): Promise<SetRoomAreaResult> {
	if ((aId === null) !== (bId === null)) return 'need-two';
	if (aId !== null && aId === bId) return 'same';

	if (aId !== null && bId !== null) {
		const inRoom = await db
			.select({ id: annotations.id, valueMm: annotations.valueMm })
			.from(annotations)
			.innerJoin(photos, eq(photos.id, annotations.photoId))
			.where(and(eq(photos.projectId, projectId), eq(photos.roomId, roomId)));
		const chosen = [aId, bId].map((id) => inRoom.find((x) => x.id === id));
		if (chosen.some((x) => !x)) return 'not-in-room';
		if (chosen.some((x) => x!.valueMm === null)) return 'no-value';
	}

	const updated = await db
		.update(rooms)
		.set({ areaAAnnotationId: aId, areaBAnnotationId: bId })
		.where(and(eq(rooms.id, roomId), eq(rooms.projectId, projectId)))
		.returning({ id: rooms.id });
	return updated.length ? 'ok' : 'room-not-found';
}
