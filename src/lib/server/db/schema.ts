import { sql } from 'drizzle-orm';
import { UNIT_SYSTEMS } from '../../units.ts';
import { index, integer, real, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`);

export const projects = sqliteTable('project', {
	id: id(),
	name: text('name').notNull(),
	unitSystem: text('unit_system', { enum: UNIT_SYSTEMS })
		.notNull()
		.default('imperial'),
	createdAt: createdAt()
});

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
		createdAt: createdAt()
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
		createdAt: createdAt()
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
		createdAt: createdAt()
	},
	(t) => [index('annotation_photo_idx').on(t.photoId)]
);

export type Project = typeof projects.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Annotation = typeof annotations.$inferSelect;
