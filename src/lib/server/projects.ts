import { error } from '@sveltejs/kit';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { Db } from './db/types.ts';
import { NAME_MAX_LENGTH } from '#lib/constants.ts';
import { UNIT_SYSTEMS, type UnitSystem } from '#lib/units.ts';
import { photos, projectMembers, projects } from './db/schema.ts';
import type { BlobStorage } from './storage/types.ts';

export function parseUnitSystem(value: FormDataEntryValue | null): UnitSystem | null {
	return (UNIT_SYSTEMS as readonly unknown[]).includes(value) ? (value as UnitSystem) : null;
}

export function parseName(value: FormDataEntryValue | null, max = NAME_MAX_LENGTH): string | null {
	const name = String(value ?? '').trim();
	return name && name.length <= max ? name : null;
}

export type ProjectRole = 'owner' | 'guest';

/**
 * A project the user owns or is a guest on, with their `role`; anyone else gets a 404, so other people's
 * projects look exactly like missing ones. `need: 'owner'` is for what only the owner may do (delete,
 * share, hand over): a guest gets a 403, because they can already see the project.
 */
export async function getProjectOr404(db: Db, userId: string, id: string, need: ProjectRole = 'guest') {
	const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
	let role: ProjectRole | null = project && project.ownerId === userId ? 'owner' : null;
	if (project && !role) {
		const [member] = await db
			.select({ userId: projectMembers.userId })
			.from(projectMembers)
			.where(and(eq(projectMembers.projectId, id), eq(projectMembers.userId, userId)));
		if (member) role = 'guest';
	}
	if (!project || !role) error(404, 'Project not found');
	if (need === 'owner' && role !== 'owner') error(403, 'Only the owner can do that');
	return { ...project, role };
}

/** Matches the projects a user can open: their own, and those they are a guest on. */
export function accessibleTo(db: Db, userId: string) {
	return or(
		eq(projects.ownerId, userId),
		inArray(projects.id, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId)))
	);
}

/** Deletes the project row (cascading to photos/rooms/annotations) and its photo blobs. */
export async function deleteProject(db: Db, storage: BlobStorage, id: string) {
	const rows = await db.select({ blobKey: photos.blobKey }).from(photos).where(eq(photos.projectId, id));
	await db.delete(projects).where(eq(projects.id, id));
	await Promise.all(rows.map((r) => storage.delete(r.blobKey)));
}
