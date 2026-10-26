import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { projectMembers, projects, users } from './db/schema.ts';
import { getProjectOr404 } from './projects.ts';
import { handOver, listGuests, removeGuest, shareProject } from './sharing.ts';
import { deleteUserAndContent } from './users.ts';
import { TEST_USER, createContext, seedProject, seedUser } from '../../tests/helpers.ts';

/** Anna (the test user) owns a project; Ben and Cleo are other accounts. */
async function world() {
	const ctx = createContext();
	const ben = await seedUser(ctx.db, { name: 'Ben', email: 'ben@example.com' });
	const cleo = await seedUser(ctx.db, { name: 'Cleo', email: 'cleo@example.com' });
	const project = await seedProject(ctx.db);
	return { ...ctx, ben, cleo, project };
}

describe('getProjectOr404 with guests', () => {
	it('tells owners, guests and strangers apart', async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		expect(await getProjectOr404(w.db, TEST_USER.id, w.project.id)).toMatchObject({ id: w.project.id, role: 'owner' });
		expect(await getProjectOr404(w.db, w.ben.id, w.project.id)).toMatchObject({ id: w.project.id, role: 'guest' });
		await expect(getProjectOr404(w.db, w.cleo.id, w.project.id)).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a guest what only the owner may do, with a 403 rather than a 404', async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		await expect(getProjectOr404(w.db, w.ben.id, w.project.id, 'owner')).rejects.toMatchObject({ status: 403 });
		expect((await getProjectOr404(w.db, TEST_USER.id, w.project.id, 'owner')).role).toBe('owner');
		await expect(getProjectOr404(w.db, w.cleo.id, w.project.id, 'owner')).rejects.toMatchObject({ status: 404 });
	});
});

describe('shareProject', () => {
	it('adds a guest by email address, ignoring case and spaces', async () => {
		const w = await world();
		expect(await shareProject(w.db, w.project, TEST_USER.id, '  BEN@Example.com ')).toBe('shared');
		expect(await listGuests(w.db, w.project.id)).toEqual([{ userId: w.ben.id, name: 'Ben', email: 'ben@example.com' }]);
		const [member] = await w.db.select().from(projectMembers);
		expect(member.addedBy).toBe(TEST_USER.id);
	});

	it('only adds people who already have an account', async () => {
		const w = await world();
		expect(await shareProject(w.db, w.project, TEST_USER.id, 'nobody@example.com')).toBe('no-account');
		expect(await shareProject(w.db, w.project, TEST_USER.id, 'not an address')).toBe('invalid-email');
		expect(await shareProject(w.db, w.project, TEST_USER.id, null)).toBe('invalid-email');
		expect(await listGuests(w.db, w.project.id)).toEqual([]);
	});

	it('does not add a disabled account, the owner, or the same person twice', async () => {
		const w = await world();
		await w.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, w.cleo.id));
		expect(await shareProject(w.db, w.project, TEST_USER.id, w.cleo.email)).toBe('no-account');
		expect(await shareProject(w.db, w.project, TEST_USER.id, TEST_USER.email)).toBe('self');
		expect(await shareProject(w.db, w.project, TEST_USER.id, w.ben.email)).toBe('shared');
		expect(await shareProject(w.db, w.project, TEST_USER.id, w.ben.email)).toBe('already');
		expect(await listGuests(w.db, w.project.id)).toHaveLength(1);
	});
});

describe('removeGuest', () => {
	it('takes access away at once, and only from that person', async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		await shareProject(w.db, w.project, TEST_USER.id, w.cleo.email);
		expect(await removeGuest(w.db, w.project.id, w.ben.id)).toBe(true);
		await expect(getProjectOr404(w.db, w.ben.id, w.project.id)).rejects.toMatchObject({ status: 404 });
		expect((await getProjectOr404(w.db, w.cleo.id, w.project.id)).role).toBe('guest');
		expect(await removeGuest(w.db, w.project.id, w.ben.id)).toBe(false);
	});
});

describe('handOver', () => {
	it('makes a guest the owner and keeps the previous owner on the project as a guest', async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		expect(handOver(w.db, w.project, w.ben.id)).toBe(true);

		expect((await getProjectOr404(w.db, w.ben.id, w.project.id)).role).toBe('owner');
		expect((await getProjectOr404(w.db, TEST_USER.id, w.project.id)).role).toBe('guest');
		expect(await listGuests(w.db, w.project.id)).toEqual([{ userId: TEST_USER.id, name: TEST_USER.name, email: TEST_USER.email }]);
		const [row] = await w.db.select().from(projects).where(eq(projects.id, w.project.id));
		expect(row.ownerId).toBe(w.ben.id);
	});

	it('refuses someone who is not a guest and changes nothing', async () => {
		const w = await world();
		expect(handOver(w.db, w.project, w.cleo.id)).toBe(false);
		expect((await getProjectOr404(w.db, TEST_USER.id, w.project.id)).role).toBe('owner');
		expect(await listGuests(w.db, w.project.id)).toEqual([]);
	});
});

describe('deleting accounts', () => {
	it("removes a deleted guest's access and keeps the project", async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		await deleteUserAndContent(w.db, w.storage, w.ben.id);
		expect(await w.db.select().from(projectMembers)).toEqual([]);
		expect((await getProjectOr404(w.db, TEST_USER.id, w.project.id)).role).toBe('owner');
	});

	it('deletes the projects an owner made, even when they are shared', async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		await deleteUserAndContent(w.db, w.storage, TEST_USER.id);
		expect(await w.db.select().from(projects)).toEqual([]);
		expect(await w.db.select().from(projectMembers)).toEqual([]);
	});

	it("keeps a project that was handed over when its previous owner's account goes", async () => {
		const w = await world();
		await shareProject(w.db, w.project, TEST_USER.id, w.ben.email);
		handOver(w.db, w.project, w.ben.id);
		await deleteUserAndContent(w.db, w.storage, TEST_USER.id);
		expect((await getProjectOr404(w.db, w.ben.id, w.project.id)).role).toBe('owner');
		expect(await listGuests(w.db, w.project.id)).toEqual([]);
	});
});
