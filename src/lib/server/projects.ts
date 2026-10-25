import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db/types.ts';
import { NAME_MAX_LENGTH } from '#lib/constants.ts';
import { UNIT_SYSTEMS, type UnitSystem } from '#lib/units.ts';
import { photos, projects } from './db/schema.ts';
import type { BlobStorage } from './storage/types.ts';

export function parseUnitSystem(value: FormDataEntryValue | null): UnitSystem | null {
	return (UNIT_SYSTEMS as readonly unknown[]).includes(value) ? (value as UnitSystem) : null;
}

export function parseName(value: FormDataEntryValue | null, max = NAME_MAX_LENGTH): string | null {
	const name = String(value ?? '').trim();
	return name && name.length <= max ? name : null;
}

/** A project the user owns, or a 404: other people's projects look exactly like missing ones. */
export async function getProjectOr404(db: Db, userId: string, id: string) {
	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, id), eq(projects.ownerId, userId))
	});
	if (!project) error(404, 'Project not found');
	return project;
}

/** Deletes the project row (cascading to photos/rooms/annotations) and its photo blobs. */
export async function deleteProject(db: Db, storage: BlobStorage, id: string) {
	const rows = await db.select({ blobKey: photos.blobKey }).from(photos).where(eq(photos.projectId, id));
	await db.delete(projects).where(eq(projects.id, id));
	await Promise.all(rows.map((r) => storage.delete(r.blobKey)));
}
