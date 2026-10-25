import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/** Drizzle database usable on both runtimes (better-sqlite3 is sync, D1 is async; always `await`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;
