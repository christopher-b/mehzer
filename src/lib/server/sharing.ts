import { and, asc, eq } from 'drizzle-orm';
import { projectMembers, projects, users } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { findUserByEmail, normalizeEmail } from './users.ts';

export const sharingMessages = {
	email: 'Enter the email address of someone who has a Mehzur account',
	noAccount: 'Nobody with that email address has a Mehzur account. They need an invite first.',
	self: 'You already own this project',
	already: 'This project is already shared with that person',
	ownerCannotLeave: 'The owner cannot leave. Hand the project over to someone first.'
};

export interface Guest {
	userId: string;
	name: string;
	email: string;
}

/** Everyone the project is shared with (not the owner), in the order they were added. */
export async function listGuests(db: Db, projectId: string): Promise<Guest[]> {
	return db
		.select({ userId: users.id, name: users.name, email: users.email })
		.from(projectMembers)
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(asc(projectMembers.addedAt), asc(users.name));
}

/** The guests of every project this user owns, by project id (a project nobody shares has no entry). */
export async function listGuestsOfOwned(db: Db, ownerId: string): Promise<Record<string, Guest[]>> {
	const rows = await db
		.select({ projectId: projectMembers.projectId, userId: users.id, name: users.name, email: users.email })
		.from(projectMembers)
		.innerJoin(projects, eq(projects.id, projectMembers.projectId))
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.where(eq(projects.ownerId, ownerId))
		.orderBy(asc(projectMembers.addedAt), asc(users.name));
	const byProject: Record<string, Guest[]> = {};
	for (const { projectId, ...guest } of rows) (byProject[projectId] ??= []).push(guest);
	return byProject;
}

export type ShareResult = 'shared' | 'invalid-email' | 'no-account' | 'self' | 'already';

/** Adds a guest by email address. Only people who already have an (enabled) account can be added. */
export async function shareProject(
	db: Db,
	project: { id: string; ownerId: string | null },
	addedBy: string,
	emailInput: FormDataEntryValue | null
): Promise<ShareResult> {
	const email = normalizeEmail(emailInput);
	if (!email) return 'invalid-email';
	const person = await findUserByEmail(db, email);
	if (!person || person.disabledAt) return 'no-account';
	if (person.id === project.ownerId) return 'self';
	const inserted = await db
		.insert(projectMembers)
		.values({ projectId: project.id, userId: person.id, addedBy })
		.onConflictDoNothing()
		.returning({ userId: projectMembers.userId });
	return inserted.length ? 'shared' : 'already';
}

/** Removes a guest (the owner removing someone, or a guest leaving). False if they were not a guest. */
export async function removeGuest(db: Db, projectId: string, userId: string): Promise<boolean> {
	const removed = await db
		.delete(projectMembers)
		.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
		.returning({ userId: projectMembers.userId });
	return removed.length > 0;
}

/**
 * Makes a current guest the owner; the previous owner stays on the project as a guest. One transaction,
 * so the project never ends up with two owners or none. False if that person is not a guest.
 */
export function handOver(db: Db, project: { id: string; ownerId: string | null }, newOwnerId: string): boolean {
	if (!project.ownerId) return false;
	const previousOwnerId = project.ownerId;
	return db.transaction((tx) => {
		const removed = tx
			.delete(projectMembers)
			.where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, newOwnerId)))
			.returning({ userId: projectMembers.userId })
			.all();
		if (!removed.length) return false;
		tx.update(projects).set({ ownerId: newOwnerId, updatedBy: previousOwnerId }).where(eq(projects.id, project.id)).run();
		tx.insert(projectMembers).values({ projectId: project.id, userId: previousOwnerId, addedBy: previousOwnerId }).run();
		return true;
	});
}
