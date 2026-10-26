import { sql } from 'drizzle-orm';
import { UNIT_SYSTEMS } from '../../units.ts';
import { index, integer, primaryKey, real, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`);

export const USER_ROLES = ['admin', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable('user', {
	id: id(),
	// Stored lower-cased; it is the sign-in name and where reset emails go.
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: USER_ROLES }).notNull().default('member'),
	createdAt: createdAt(),
	disabledAt: integer('disabled_at', { mode: 'timestamp_ms' })
});

/** Only a keyed hash of the cookie's random token is stored, never the token itself. */
export const sessions = sqliteTable(
	'session',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		userAgent: text('user_agent'),
		createdAt: createdAt(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

/** An invite link created by the admin; single use, expiring. Only the token's hash is stored. */
export const invites = sqliteTable('invite', {
	id: id(),
	tokenHash: text('token_hash').notNull().unique(),
	// Optional: when set, the invited person's address is fixed to this one.
	email: text('email'),
	createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	createdAt: createdAt(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	usedAt: integer('used_at', { mode: 'timestamp_ms' }),
	usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
	revokedAt: integer('revoked_at', { mode: 'timestamp_ms' })
});

export const passwordResets = sqliteTable(
	'password_reset',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: createdAt(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('password_reset_user_idx').on(t.userId)]
);

export const emailChanges = sqliteTable(
	'email_change',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		newEmail: text('new_email').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		createdAt: createdAt(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('email_change_user_idx').on(t.userId)]
);

/** Failed sign-ins, kept to limit guessing. `key` is `email:<address>` or `ip:<address>`. */
export const loginAttempts = sqliteTable(
	'login_attempt',
	{
		id: id(),
		key: text('key').notNull(),
		at: integer('at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('login_attempt_key_idx').on(t.key, t.at)]
);

/** Who created or last changed a row: null for old rows and for rows whose user was deleted. */
const authorship = () => ({
	createdBy: text('created_by').references((): AnySQLiteColumn => users.id, { onDelete: 'set null' }),
	updatedBy: text('updated_by').references((): AnySQLiteColumn => users.id, { onDelete: 'set null' })
});

export const projects = sqliteTable(
	'project',
	{
		id: id(),
		// Nullable in the database (SQLite cannot add a NOT NULL column to a table with data); every query
		// is limited to the signed-in user's projects. Projects from before accounts are given to the first admin.
		ownerId: text('owner_id').references((): AnySQLiteColumn => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		unitSystem: text('unit_system', { enum: UNIT_SYSTEMS })
			.notNull()
			.default('imperial'),
		createdAt: createdAt(),
		...authorship()
	},
	(t) => [index('project_owner_idx').on(t.ownerId)]
);

/** A guest on someone else's project (the owner stays in `project.owner_id`). */
export const projectMembers = sqliteTable(
	'project_member',
	{
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		addedAt: createdAt(),
		addedBy: text('added_by').references((): AnySQLiteColumn => users.id, { onDelete: 'set null' })
	},
	(t) => [primaryKey({ columns: [t.projectId, t.userId] }), index('project_member_user_idx').on(t.userId)]
);

export const photos = sqliteTable(
	'photo',
	{
		id: id(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		// Null = the "No room" group. Deleting a room moves its photos there.
		roomId: text('room_id').references((): AnySQLiteColumn => rooms.id, { onDelete: 'set null' }),
		blobKey: text('blob_key').notNull().unique(),
		width: integer('width').notNull(),
		height: integer('height').notNull(),
		caption: text('caption'),
		createdAt: createdAt(),
		...authorship()
	},
	(t) => [index('photo_project_idx').on(t.projectId), index('photo_room_idx').on(t.roomId)]
);

export const rooms = sqliteTable(
	'room',
	{
		id: id(),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		areaAAnnotationId: text('area_a_annotation_id').references(
			(): AnySQLiteColumn => annotations.id,
			{ onDelete: 'set null' }
		),
		areaBAnnotationId: text('area_b_annotation_id').references(
			(): AnySQLiteColumn => annotations.id,
			{ onDelete: 'set null' }
		),
		createdAt: createdAt(),
		...authorship()
	},
	(t) => [index('room_project_idx').on(t.projectId)]
);

export const annotations = sqliteTable(
	'annotation',
	{
		id: id(),
		photoId: text('photo_id')
			.notNull()
			.references(() => photos.id, { onDelete: 'cascade' }),
		// A measurement's room is always its photo's room (photo.room_id); it is not stored here.
		name: text('name'),
		// Endpoints normalized to 0–1 relative to image width/height.
		x1: real('x1').notNull(),
		y1: real('y1').notNull(),
		x2: real('x2').notNull(),
		y2: real('y2').notNull(),
		// Canonical length in millimetres; null until a value is entered.
		valueMm: real('value_mm'),
		createdAt: createdAt(),
		...authorship()
	},
	(t) => [index('annotation_photo_idx').on(t.photoId)]
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Annotation = typeof annotations.$inferSelect;
