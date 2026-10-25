import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import type { Db } from './types';

let db: Db | undefined;

export function getNodeDb(path: string, migrationsFolder: string): Db {
	if (db) return db;
	mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const instance = drizzle(sqlite, { schema });
	migrate(instance, { migrationsFolder });
	db = instance as unknown as Db;
	return db;
}
