import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Db } from './types';

export function getD1Db(binding: D1Database): Db {
	return drizzle(binding, { schema }) as unknown as Db;
}
