import type { Db } from './db/types.ts';
import type { BlobStorage } from './storage/types.ts';

export interface Services {
	db: Db;
	storage: BlobStorage;
}

let services: Promise<Services> | undefined;

/**
 * Resolve db + storage for the current runtime. `__DEPLOY_TARGET__` is a build-time
 * constant, so the unused branch (and its imports, e.g. better-sqlite3) is dropped from the bundle.
 */
export function getServices(): Promise<Services> {
	services ??=
		__DEPLOY_TARGET__ === 'cloudflare'
			? import('./services-cloudflare.ts').then((m) => m.createCloudflareServices())
			: import('./services-node.ts').then((m) => m.createNodeServices());
	return services;
}
