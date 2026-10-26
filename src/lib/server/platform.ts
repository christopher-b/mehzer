import { DATABASE_PATH, MIGRATIONS_PATH, PHOTOS_PATH } from '$app/env/private';
import { getNodeDb } from './db/node.ts';
import type { Db } from './db/types.ts';
import { createFsStorage } from './storage/fs.ts';
import type { BlobStorage } from './storage/types.ts';

export interface Services {
	db: Db;
	storage: BlobStorage;
}

let services: Services | undefined;

/** The database (migrated on first use) and photo storage, created once per process. */
export async function getServices(): Promise<Services> {
	services ??= {
		db: getNodeDb(DATABASE_PATH, MIGRATIONS_PATH),
		storage: createFsStorage(PHOTOS_PATH)
	};
	return services;
}
