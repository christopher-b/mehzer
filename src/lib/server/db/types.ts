import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/** The Drizzle database (better-sqlite3, so calls are synchronous; existing code still `await`s them). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;
