import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { photos, projects } from '#lib/server/db/schema.ts';
import { requireUser } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (params.key.split('/').some((part) => part === '..' || part === '')) error(404, 'Photo not found');
	// Only photos of the signed-in user's own projects: look the key up in the database, never trust its text.
	const owned = await locals.db
		.select({ id: photos.id })
		.from(photos)
		.innerJoin(projects, eq(projects.id, photos.projectId))
		.where(and(eq(photos.blobKey, params.key), eq(projects.ownerId, requireUser(locals).id)));
	if (owned.length === 0) error(404, 'Photo not found');
	const blob = await locals.storage.get(params.key);
	if (!blob) error(404, 'Photo not found');

	return new Response(blob.body, {
		headers: {
			'content-type': blob.contentType,
			'content-length': String(blob.size),
			// Keys are immutable (new upload = new key).
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
