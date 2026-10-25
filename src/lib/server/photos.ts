import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { Db } from './db/types.ts';
import type { BlobStorage } from './storage/types.ts';
import { annotations, photos, rooms } from './db/schema.ts';
import { getProjectOr404 } from './projects.ts';
import { findRoomInProject } from './rooms.ts';

/**
 * Display order of photos: oldest first. `created_at` only has whole-second resolution, so photos
 * uploaded together tie; SQLite's `rowid` (insertion order) breaks the tie.
 */
export const photoOrder = [asc(photos.createdAt), asc(sql`${photos}.rowid`)];

/** The project and one of its photos, or a 404 if either doesn't exist. */
export async function getPhotoOr404(db: Db, userId: string, projectId: string, photoId: string) {
	const project = await getProjectOr404(db, userId, projectId);
	const photo = await db.query.photos.findFirst({
		where: and(eq(photos.id, photoId), eq(photos.projectId, project.id))
	});
	if (!photo) error(404, 'Photo not found');
	return { project, photo };
}

/** Measurements within a photo, oldest first (rowid breaks whole-second ties, as for photos). */
export const annotationOrder = [asc(annotations.createdAt), asc(sql`${annotations}.rowid`)];

/** Rooms in creation order. */
export const roomOrder = [asc(rooms.createdAt), asc(sql`${rooms}.rowid`)];

/**
 * Adds `number`: each measurement's 1-based position among those on its own photo. The rows must
 * already be in display order (photo order, then annotationOrder).
 */
export function numberWithinPhoto<T extends { photoId: string }>(rows: T[]): (T & { number: number })[] {
	const counts = new Map<string, number>();
	return rows.map((row) => {
		const number = (counts.get(row.photoId) ?? 0) + 1;
		counts.set(row.photoId, number);
		return { ...row, number };
	});
}

export interface PhotoNeighbour {
	id: string;
	blobKey: string;
}

export interface PhotoNeighbours {
	/** 1-based position among the photos in the same room (or among those with no room). */
	position: number;
	total: number;
	previous: PhotoNeighbour | null;
	next: PhotoNeighbour | null;
}

/** The photos either side of this one within its room (or within "No room"), in display order. */
export async function getPhotoNeighbours(
	db: Db,
	projectId: string,
	photo: { id: string; roomId: string | null }
): Promise<PhotoNeighbours> {
	const siblings = await db
		.select({ id: photos.id, blobKey: photos.blobKey })
		.from(photos)
		.where(
			and(
				eq(photos.projectId, projectId),
				photo.roomId ? eq(photos.roomId, photo.roomId) : isNull(photos.roomId)
			)
		)
		.orderBy(...photoOrder);
	const index = siblings.findIndex((p) => p.id === photo.id);
	if (index < 0) return { position: 1, total: 1, previous: null, next: null };
	return {
		position: index + 1,
		total: siblings.length,
		previous: index > 0 ? siblings[index - 1] : null,
		next: index < siblings.length - 1 ? siblings[index + 1] : null
	};
}

/**
 * Delete a photo and its stored file. Its measurements go with it (foreign key cascade) and any
 * room area that used them is cleared (foreign key set null). False if it isn't in this project.
 */
export async function deletePhoto(
	db: Db,
	storage: BlobStorage,
	projectId: string,
	photoId: string
): Promise<boolean> {
	const [photo] = await db
		.delete(photos)
		.where(and(eq(photos.id, photoId), eq(photos.projectId, projectId)))
		.returning({ blobKey: photos.blobKey });
	if (!photo) return false;
	await storage.delete(photo.blobKey);
	return true;
}

export type SetPhotoRoomResult = 'ok' | 'unknown-room' | 'not-found';

/**
 * Put a photo in a room (or in "No room" when `roomId` is null). Its measurements follow,
 * since a measurement's room is its photo's room, so any room area that was built from this
 * photo's measurements is cleared rather than left silently pointing at the wrong room.
 */
export async function setPhotoRoom(
	db: Db,
	projectId: string,
	photoId: string,
	roomId: string | null,
	userId: string | null = null
): Promise<SetPhotoRoomResult> {
	if (roomId) {
		const room = await findRoomInProject(db, projectId, roomId);
		if (!room) return 'unknown-room';
	}

	const moved = await db
		.update(photos)
		.set({ roomId, updatedBy: userId })
		.where(and(eq(photos.id, photoId), eq(photos.projectId, projectId)))
		.returning({ id: photos.id });
	if (!moved.length) return 'not-found';

	const photoAnnotationIds = db
		.select({ id: annotations.id })
		.from(annotations)
		.where(eq(annotations.photoId, photoId));
	await db
		.update(rooms)
		.set({ areaAAnnotationId: null, areaBAnnotationId: null })
		.where(
			and(
				eq(rooms.projectId, projectId),
				or(
					inArray(rooms.areaAAnnotationId, photoAnnotationIds),
					inArray(rooms.areaBAnnotationId, photoAnnotationIds)
				)
			)
		);
	return 'ok';
}
