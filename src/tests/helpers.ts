import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '#lib/server/db/schema.ts';
import { annotations, photos, projects, rooms } from '#lib/server/db/schema.ts';
import type { Db } from '#lib/server/db/types.ts';
import type { BlobStorage } from '#lib/server/storage/types.ts';

/** Fresh in-memory SQLite database with the real migrations applied and foreign keys enforced. */
export function createTestDb(): Db {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	return db as unknown as Db;
}

/** In-memory BlobStorage that also exposes what is stored, for assertions. */
export function createMemoryStorage() {
	const blobs = new Map<string, { data: Uint8Array; contentType: string }>();
	const storage: BlobStorage = {
		async put(key, data, contentType) {
			blobs.set(key, {
				data: data instanceof Uint8Array ? data : new Uint8Array(data),
				contentType
			});
		},
		async get(key) {
			const blob = blobs.get(key);
			if (!blob) return null;
			return {
				body: new Response(blob.data as BodyInit).body as ReadableStream<Uint8Array>,
				contentType: blob.contentType,
				size: blob.data.byteLength
			};
		},
		async delete(key) {
			blobs.delete(key);
		}
	};
	return { storage, blobs };
}

export function createContext() {
	const db = createTestDb();
	const { storage, blobs } = createMemoryStorage();
	const locals = { db, storage, authenticated: true } as App.Locals;
	return { db, storage, blobs, locals };
}

export async function seedProject(db: Db, values: Partial<typeof projects.$inferInsert> = {}) {
	const [row] = await db
		.insert(projects)
		.values({ name: 'House', unitSystem: 'imperial', ...values })
		.returning();
	return row;
}

export async function seedRoom(db: Db, projectId: string, name = 'Kitchen') {
	const [row] = await db.insert(rooms).values({ projectId, name }).returning();
	return row;
}

let blobCounter = 0;
export async function seedPhoto(
	db: Db,
	projectId: string,
	values: Partial<typeof photos.$inferInsert> = {}
) {
	const [row] = await db
		.insert(photos)
		.values({ projectId, blobKey: `test/${++blobCounter}.jpg`, width: 640, height: 480, ...values })
		.returning();
	return row;
}

export async function seedAnnotation(
	db: Db,
	photoId: string,
	values: Partial<typeof annotations.$inferInsert> = {}
) {
	const [row] = await db
		.insert(annotations)
		.values({ photoId, x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, valueMm: 3000, ...values })
		.returning();
	return row;
}

export function formData(fields: Record<string, string | number | null | undefined | File>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value === null || value === undefined) continue;
		form.set(key, value instanceof File ? value : String(value));
	}
	return form;
}

type Handler = (event: never) => unknown;

/** Invoke a SvelteKit form action / endpoint with just the event fields our code reads. */
export function call<T = unknown>(
	handler: Handler | undefined,
	event: { locals: App.Locals; params?: Record<string, string>; form?: FormData }
): Promise<T> {
	if (!handler) throw new Error('handler missing');
	const request = new Request('http://localhost/test', {
		method: 'POST',
		body: event.form ?? new FormData()
	});
	return Promise.resolve(handler({ ...event, params: event.params ?? {}, request } as never)) as Promise<T>;
}

/** Like `call` for a page `load`: pass the route's generated `PageData` as `T` for typed results. */
export function callLoad<T = unknown>(
	handler: Handler | undefined,
	event: { locals: App.Locals; params?: Record<string, string> }
): Promise<T> {
	return call(handler, event) as Promise<T>;
}

/** The `{ status, data }` of a `fail()` result, or null for a successful action. */
export function failure(result: unknown): { status: number; error: string } | null {
	if (!result || typeof result !== 'object' || !('status' in result)) return null;
	const { status, data } = result as { status: number; data?: { error?: string } };
	return { status, error: data?.error ?? '' };
}
