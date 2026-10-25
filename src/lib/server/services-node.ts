import { DATABASE_PATH, MIGRATIONS_PATH, PHOTOS_PATH } from '$app/env/private';
import { getNodeDb } from './db/node.ts';
import { createFsStorage } from './storage/fs.ts';
import type { Services } from './platform.ts';

export function createNodeServices(): Services {
	return {
		db: getNodeDb(DATABASE_PATH, MIGRATIONS_PATH),
		storage: createFsStorage(PHOTOS_PATH)
	};
}
