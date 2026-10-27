import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '#lib/server/db/schema.ts';
import { annotations, photos, projects, rooms, users } from '#lib/server/db/schema.ts';
import type { SessionUser } from '#lib/server/users.ts';
import type { Db } from '#lib/server/db/types.ts';
import type { BlobStorage } from '#lib/server/storage/types.ts';

/** The signed-in user of every test context; its row exists in each fresh test database. */
export const TEST_USER: SessionUser = { id: 'user-test-1', email: 'test@example.com', name: 'Test User', role: 'admin' };

/** Fresh in-memory SQLite database with the real migrations applied and foreign keys enforced. */
export function createTestDb(): Db {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	sqlite
		.prepare('insert into user (id, email, name, password_hash, role) values (?, ?, ?, ?, ?)')
		.run(TEST_USER.id, TEST_USER.email, TEST_USER.name, 'not-a-real-hash', TEST_USER.role);
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
	const locals = { db, storage, user: TEST_USER, sessionId: 'session-test-1' } as App.Locals;
	return { db, storage, blobs, locals };
}

export async function seedProject(db: Db, values: Partial<typeof projects.$inferInsert> = {}) {
	const [row] = await db
		.insert(projects)
		.values({ name: 'House', unitSystem: 'imperial', ownerId: TEST_USER.id, ...values })
		.returning();
	return row;
}

/** Another account, for tests about who can see what. */
export async function seedUser(db: Db, values: Partial<typeof users.$inferInsert> = {}) {
	const n = ++userCounter;
	const [row] = await db
		.insert(users)
		.values({ email: `user${n}@example.com`, name: `User ${n}`, passwordHash: 'not-a-real-hash', ...values })
		.returning();
	return row;
}
let userCounter = 1;

/** The same context as `createContext`, but signed in as another user. */
export function asUser<T extends { locals: App.Locals }>(ctx: T, user: SessionUser): T {
	return { ...ctx, locals: { ...ctx.locals, user } };
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

const MAGIC: Record<string, number[]> = {
	'image/jpeg': [0xff, 0xd8, 0xff],
	'image/png': [0x89, 0x50, 0x4e, 0x47],
	'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
};

/** A file that starts with the real signature of its type (the upload endpoint checks it), padded to `size` bytes. */
export function imageFile(type = 'image/jpeg', size = 16): File {
	const bytes = new Uint8Array(size).fill(7);
	bytes.set((MAGIC[type] ?? []).slice(0, size));
	return new File([bytes], 'photo', { type });
}
