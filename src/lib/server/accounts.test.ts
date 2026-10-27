import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { annotations, invites, loginAttempts, passwordResets, photos, projects, rooms, sessions, users } from './db/schema.ts';
import { INVITE_TTL_MS, RESET_TTL_MS, acceptInvite, completePasswordReset, createInvite, createPasswordReset, findUsableInvite, listPendingInvites, revokeInvite } from './invites.ts';
import { createSession, deleteSession, deleteUserSessions, findSession } from './sessions.ts';
import {
	LOGIN_LIMIT_PER_IP,
	SETUP_DONE,
	authenticate,
	claimOrphanProjects,
	countUsers,
	createFirstAdmin,
	createUser,
	recordFailure,
	deleteUserAndContent,
	findUserByEmail,
	normalizeEmail,
	parsePersonName
} from './users.ts';
import { verifyPassword } from './password.ts';
import { SESSION_TTL_MS } from './auth.ts';
import { createContext, seedAnnotation, seedPhoto, seedProject, seedRoom, seedUser } from '../../tests/helpers.ts';

const SECRET = 'unit-test-secret';
const PASSWORD = 'correct horse battery';
const NOW = 1_800_000_000_000;

describe('normalizeEmail / parsePersonName', () => {
	it('trims and lower-cases a valid address', () => {
		expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com');
	});
	it.each(['', 'anna', 'anna@', '@example.com', 'a b@example.com', 'anna@example', null, undefined, 'x'.repeat(260) + '@a.bc'])(
		'rejects %j',
		(value) => {
			expect(normalizeEmail(value as string)).toBeNull();
		}
	);
	it('accepts a name of sensible length only', () => {
		expect(parsePersonName(' Anna ')).toBe('Anna');
		expect(parsePersonName('')).toBeNull();
		expect(parsePersonName('x'.repeat(101))).toBeNull();
	});
});

describe('createUser', () => {
	it('stores a hashed password and lower-case email, as a member by default', async () => {
		const { db } = createContext();
		const result = await createUser(db, { email: 'anna@example.com', name: 'Anna', password: PASSWORD });
		if ('error' in result) throw new Error(result.error);
		expect(result.user).toMatchObject({ email: 'anna@example.com', name: 'Anna', role: 'member' });
		expect(result.user.passwordHash).not.toContain(PASSWORD);
		expect(await verifyPassword(PASSWORD, result.user.passwordHash)).toBe(true);
	});

	it('refuses a second account with the same email, and a weak password', async () => {
		const { db } = createContext();
		await createUser(db, { email: 'anna@example.com', name: 'Anna', password: PASSWORD });
		expect(await createUser(db, { email: 'anna@example.com', name: 'Other', password: PASSWORD })).toMatchObject({
			error: expect.stringContaining('already')
		});
		expect(await createUser(db, { email: 'b@example.com', name: 'B', password: 'short' })).toMatchObject({
			error: expect.stringContaining('at least')
		});
		expect(await countUsers(db)).toBe(2); // the test user and Anna
	});

	it('returns EMAIL_TAKEN, never throws, when two requests for one address run together', async () => {
		const { db } = createContext();
		const make = (name: string) => createUser(db, { email: 'race@example.com', name, password: PASSWORD });
		const results = await Promise.all([make('One'), make('Two'), make('Three')]);
		expect(results.filter((r) => 'user' in r)).toHaveLength(1);
		expect(results.filter((r) => 'error' in r)).toHaveLength(2);
		expect(await db.select().from(users).where(eq(users.email, 'race@example.com'))).toHaveLength(1);
	});
});

describe('createFirstAdmin', () => {
	it('makes one admin, however many setup requests arrive, and gives them the ownerless projects', async () => {
		const { db } = createContext();
		const orphan = await seedProject(db);
		await db.update(projects).set({ ownerId: null, createdBy: null, updatedBy: null });
		await db.delete(users);
		const make = (email: string) => createFirstAdmin(db, { email, name: 'Admin', password: PASSWORD });
		const results = await Promise.all([make('a@example.com'), make('b@example.com')]);
		expect(results.filter((r) => 'user' in r)).toHaveLength(1);
		expect(results.find((r) => 'error' in r)).toEqual({ error: SETUP_DONE });
		expect(await countUsers(db)).toBe(1);
		const [admin] = await db.select().from(users);
		expect(admin.role).toBe('admin');
		const [project] = await db.select().from(projects).where(eq(projects.id, orphan.id));
		expect(project.ownerId).toBe(admin.id);
	});
});

describe('sessions', () => {
	it('finds the user behind a token, and stores only a hash of it', async () => {
		const { db } = createContext();
		const user = await seedUser(db);
		const token = await createSession(db, SECRET, user.id, 'agent', NOW);
		const found = await findSession(db, SECRET, token, NOW + 1000);
		expect(found?.user).toMatchObject({ id: user.id, email: user.email });
		expect(found?.user).not.toHaveProperty('passwordHash');
		const [row] = await db.select().from(sessions);
		expect(row.tokenHash).not.toContain(token);
		expect(row.userAgent).toBe('agent');
	});

	it('lasts 30 days, then is removed', async () => {
		const { db } = createContext();
		const user = await seedUser(db);
		const token = await createSession(db, SECRET, user.id, null, NOW);
		expect(await findSession(db, SECRET, token, NOW + SESSION_TTL_MS - 1)).not.toBeNull();
		expect(await findSession(db, SECRET, token, NOW + SESSION_TTL_MS + 1)).toBeNull();
		expect(await db.select().from(sessions)).toHaveLength(0);
	});

	it.each([undefined, '', 'garbage'])('does not know token %j', async (token) => {
		const { db } = createContext();
		expect(await findSession(db, SECRET, token)).toBeNull();
	});

	it('is not valid under another secret', async () => {
		const { db } = createContext();
		const user = await seedUser(db);
		const token = await createSession(db, SECRET, user.id, null);
		expect(await findSession(db, 'another-secret', token)).toBeNull();
	});

	it('ends when the user is disabled, and can be deleted one at a time or all but one', async () => {
		const { db } = createContext();
		const user = await seedUser(db);
		const a = await createSession(db, SECRET, user.id, null);
		const b = await createSession(db, SECRET, user.id, null);
		const c = await createSession(db, SECRET, user.id, null);

		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
		expect(await findSession(db, SECRET, a)).toBeNull();
		await db.update(users).set({ disabledAt: null }).where(eq(users.id, user.id));

		await deleteSession(db, SECRET, a);
		expect(await findSession(db, SECRET, a)).toBeNull();
		const keep = await findSession(db, SECRET, b);
		await deleteUserSessions(db, user.id, keep!.sessionId);
		expect(await findSession(db, SECRET, b)).not.toBeNull();
		expect(await findSession(db, SECRET, c)).toBeNull();
		await deleteUserSessions(db, user.id);
		expect(await findSession(db, SECRET, b)).toBeNull();
	});
});

describe('invites', () => {
	const person = { email: 'new@example.com', name: 'New', password: PASSWORD };

	it('turns a valid link into an account once, storing only a hash of the token', async () => {
		const { db } = createContext();
		const admin = await seedUser(db, { role: 'admin' });
		const { token } = await createInvite(db, SECRET, { email: null, createdBy: admin.id }, NOW);
		const [stored] = await db.select().from(invites);
		expect(stored.tokenHash).not.toContain(token);

		const result = await acceptInvite(db, SECRET, token, person, NOW + 1000);
		if ('error' in result) throw new Error(result.error);
		expect(result.user).toMatchObject({ email: 'new@example.com', role: 'member' });
		const [used] = await db.select().from(invites);
		expect(used.usedBy).toBe(result.user.id);

		expect(await acceptInvite(db, SECRET, token, { ...person, email: 'other@example.com' }, NOW + 2000)).toMatchObject({
			error: expect.stringContaining('no longer valid')
		});
	});

	it('expires after 7 days and can be revoked', async () => {
		const { db } = createContext();
		const admin = await seedUser(db, { role: 'admin' });
		const { token, invite } = await createInvite(db, SECRET, { email: null, createdBy: admin.id }, NOW);
		expect(await findUsableInvite(db, SECRET, token, NOW + INVITE_TTL_MS - 1)).not.toBeNull();
		expect(await findUsableInvite(db, SECRET, token, NOW + INVITE_TTL_MS + 1)).toBeNull();

		const second = await createInvite(db, SECRET, { email: null, createdBy: admin.id }, NOW);
		expect(await listPendingInvites(db, NOW + 1)).toHaveLength(2);
		await revokeInvite(db, second.invite.id, NOW + 1);
		expect(await findUsableInvite(db, SECRET, second.token, NOW + 2)).toBeNull();
		expect(await listPendingInvites(db, NOW + 1)).toHaveLength(1);
		expect(invite.id).toBeTruthy();
	});

	it('holds the invited person to the address it was made for', async () => {
		const { db } = createContext();
		const admin = await seedUser(db, { role: 'admin' });
		const { token } = await createInvite(db, SECRET, { email: 'new@example.com', createdBy: admin.id }, NOW);
		expect(await acceptInvite(db, SECRET, token, { ...person, email: 'other@example.com' }, NOW)).toMatchObject({
			error: expect.stringContaining('different email')
		});
		expect(await acceptInvite(db, SECRET, token, person, NOW)).toHaveProperty('user');
	});

	it('stays usable when the account could not be made (email taken, weak password)', async () => {
		const { db } = createContext();
		const admin = await seedUser(db, { role: 'admin' });
		const { token } = await createInvite(db, SECRET, { email: null, createdBy: admin.id }, NOW);
		expect(await acceptInvite(db, SECRET, token, { ...person, email: admin.email }, NOW)).toHaveProperty('error');
		expect(await acceptInvite(db, SECRET, token, { ...person, password: 'short' }, NOW)).toHaveProperty('error');
		expect(await findUsableInvite(db, SECRET, token, NOW)).not.toBeNull();
		expect(await acceptInvite(db, SECRET, token, person, NOW)).toHaveProperty('user');
	});
});

describe('invites accepted together', () => {
	it('one address gets one account; the invite that lost stays usable', async () => {
		const { db } = createContext();
		const admin = await seedUser(db, { role: 'admin' });
		const first = await createInvite(db, SECRET, { email: null, createdBy: admin.id }, NOW);
		const second = await createInvite(db, SECRET, { email: null, createdBy: admin.id }, NOW);
		const person = { email: 'same@example.com', name: 'Same', password: PASSWORD };
		const results = await Promise.all([
			acceptInvite(db, SECRET, first.token, person, NOW),
			acceptInvite(db, SECRET, second.token, person, NOW)
		]);
		expect(results.filter((r) => 'user' in r)).toHaveLength(1);
		expect(results.filter((r) => 'error' in r)).toHaveLength(1);
		expect(await db.select().from(users).where(eq(users.email, 'same@example.com'))).toHaveLength(1);

		const used = (await db.select().from(invites)).filter((i) => i.usedAt);
		expect(used).toHaveLength(1);
		expect(used[0].usedBy).not.toBeNull();
		const usable = await Promise.all([first, second].map((i) => findUsableInvite(db, SECRET, i.token, NOW)));
		expect(usable.filter(Boolean)).toHaveLength(1);
	});
});

describe('password reset links', () => {
	it('sets the new password once; the old password stops working', async () => {
		const { db } = createContext();
		const created = await createUser(db, { email: 'anna@example.com', name: 'Anna', password: PASSWORD });
		if ('error' in created) throw new Error(created.error);
		const token = await createPasswordReset(db, SECRET, created.user.id, NOW);
		const [stored] = await db.select().from(passwordResets);
		expect(stored.tokenHash).not.toContain(token);

		const done = await completePasswordReset(db, SECRET, token, 'a brand new password', NOW + 1000);
		expect(done).toHaveProperty('user');
		const after = await findUserByEmail(db, 'anna@example.com');
		expect(await verifyPassword('a brand new password', after!.passwordHash)).toBe(true);
		expect(await verifyPassword(PASSWORD, after!.passwordHash)).toBe(false);

		expect(await completePasswordReset(db, SECRET, token, 'yet another password', NOW + 2000)).toMatchObject({
			error: expect.stringContaining('no longer valid')
		});
	});

	it('expires after an hour, and a newer link cancels the older one', async () => {
		const { db } = createContext();
		const user = await seedUser(db);
		const first = await createPasswordReset(db, SECRET, user.id, NOW);
		expect(await completePasswordReset(db, SECRET, first, 'a brand new password', NOW + RESET_TTL_MS + 1)).toHaveProperty('error');

		const older = await createPasswordReset(db, SECRET, user.id, NOW);
		const newer = await createPasswordReset(db, SECRET, user.id, NOW + 10);
		expect(await completePasswordReset(db, SECRET, older, 'a brand new password', NOW + 20)).toHaveProperty('error');
		expect(await completePasswordReset(db, SECRET, newer, 'a brand new password', NOW + 20)).toHaveProperty('user');
	});

	it('does not use up the link on a weak password, and refuses disabled accounts', async () => {
		const { db } = createContext();
		const user = await seedUser(db);
		const token = await createPasswordReset(db, SECRET, user.id, NOW);
		expect(await completePasswordReset(db, SECRET, token, 'short', NOW)).toMatchObject({ error: expect.stringContaining('at least') });
		await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, user.id));
		expect(await completePasswordReset(db, SECRET, token, 'a brand new password', NOW)).toHaveProperty('error');
	});
});

describe('authenticate', () => {
	it('a successful sign-in clears that address\'s failures but not the client address\'s', async () => {
		const { db } = createContext();
		await createUser(db, { email: 'anna@example.com', name: 'Anna', password: PASSWORD });
		await recordFailure(db, ['email:anna@example.com', 'ip:1.2.3.4'], NOW);
		const result = await authenticate(db, { email: 'anna@example.com', password: PASSWORD, ip: '1.2.3.4' }, NOW + 1000);
		expect(result).toHaveProperty('user');
		const left = (await db.select().from(loginAttempts)).map((a) => a.key);
		expect(left).toEqual(['ip:1.2.3.4']);
		expect(LOGIN_LIMIT_PER_IP).toBeGreaterThan(1);
	});
});

describe('claimOrphanProjects', () => {
	it('gives projects without an owner to the user, and leaves owned ones alone', async () => {
		const { db } = createContext();
		const admin = await seedUser(db, { role: 'admin' });
		const other = await seedUser(db);
		const orphan = await seedProject(db, { ownerId: null });
		const owned = await seedProject(db, { ownerId: other.id });
		await claimOrphanProjects(db, admin.id);
		expect((await db.select().from(projects).where(eq(projects.id, orphan.id)))[0].ownerId).toBe(admin.id);
		expect((await db.select().from(projects).where(eq(projects.id, owned.id)))[0].ownerId).toBe(other.id);
	});
});

describe('deleteUserAndContent', () => {
	it('removes the user, their sessions, projects, photos, measurements and files, and nobody else\'s', async () => {
		const { db, storage, blobs } = createContext();
		const leaver = await seedUser(db);
		const stayer = await seedUser(db);
		const mine = await seedProject(db, { ownerId: leaver.id });
		const room = await seedRoom(db, mine.id);
		const myPhoto = await seedPhoto(db, mine.id, { roomId: room.id, blobKey: 'projects/a/1.jpg' });
		await seedAnnotation(db, myPhoto.id);
		const theirs = await seedProject(db, { ownerId: stayer.id });
		const theirPhoto = await seedPhoto(db, theirs.id, { blobKey: 'projects/b/1.jpg' });
		await storage.put('projects/a/1.jpg', new Uint8Array([1]), 'image/jpeg');
		await storage.put('projects/b/1.jpg', new Uint8Array([2]), 'image/jpeg');
		await createSession(db, SECRET, leaver.id, null);

		await deleteUserAndContent(db, storage, leaver.id);

		expect(await db.select().from(users).where(eq(users.id, leaver.id))).toHaveLength(0);
		expect(await db.select().from(sessions).where(eq(sessions.userId, leaver.id))).toHaveLength(0);
		expect(await db.select().from(projects).where(eq(projects.id, mine.id))).toHaveLength(0);
		expect(await db.select().from(rooms).where(eq(rooms.projectId, mine.id))).toHaveLength(0);
		expect(await db.select().from(annotations).where(eq(annotations.photoId, myPhoto.id))).toHaveLength(0);
		expect([...blobs.keys()]).toEqual(['projects/b/1.jpg']);
		expect(await db.select().from(photos).where(eq(photos.id, theirPhoto.id))).toHaveLength(1);
		expect(await db.select().from(projects).where(eq(projects.id, theirs.id))).toHaveLength(1);
	});

	it('keeps content the user made elsewhere, with the author cleared ("deleted user")', async () => {
		const { db, storage } = createContext();
		const leaver = await seedUser(db);
		const stayer = await seedUser(db);
		const shared = await seedProject(db, { ownerId: stayer.id });
		const photo = await seedPhoto(db, shared.id, { createdBy: leaver.id, updatedBy: leaver.id });
		const note = await seedAnnotation(db, photo.id, { createdBy: leaver.id });
		await deleteUserAndContent(db, storage, leaver.id);
		const [kept] = await db.select().from(photos).where(eq(photos.id, photo.id));
		expect(kept).toMatchObject({ createdBy: null, updatedBy: null });
		const [keptNote] = await db.select().from(annotations).where(eq(annotations.id, note.id));
		expect(keptNote.createdBy).toBeNull();
	});
});
