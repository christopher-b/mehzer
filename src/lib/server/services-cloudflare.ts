import { env } from 'cloudflare:workers';
import { getD1Db } from './db/d1.ts';
import { createR2Storage } from './storage/r2.ts';
import type { Services } from './platform.ts';

export function createCloudflareServices(): Services {
	return { db: getD1Db(env.DB), storage: createR2Storage(env.PHOTOS) };
}
