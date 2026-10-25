import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (params.key.split('/').some((part) => part === '..' || part === '')) error(404, 'Photo not found');
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
