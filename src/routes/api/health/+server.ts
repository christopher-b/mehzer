import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/** Authenticated end-to-end check of db + storage on the current platform. */
export const GET: RequestHandler = async ({ locals }) => {
	await locals.db.run(sql`select 1`);

	const key = `_health/${crypto.randomUUID()}`;
	await locals.storage.put(key, new TextEncoder().encode('ok'), 'text/plain');
	const blob = await locals.storage.get(key);
	const text = blob ? await new Response(blob.body).text() : null;
	await locals.storage.delete(key);

	return Response.json({ target: __DEPLOY_TARGET__, db: 'ok', storage: text === 'ok' ? 'ok' : 'fail' });
};
