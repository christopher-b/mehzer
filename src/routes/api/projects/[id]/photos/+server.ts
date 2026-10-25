import { error } from '@sveltejs/kit';
import { photos } from '#lib/server/db/schema.ts';
import { formId } from '#lib/server/forms.ts';
import { findRoomInProject } from '#lib/server/rooms.ts';
import { getProjectOr404 } from '#lib/server/projects.ts';
import { requireUser } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 10_000;
const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

function parseDimension(value: FormDataEntryValue | null): number {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 1 || n > MAX_DIMENSION) error(400, 'Invalid image dimensions');
	return n;
}

/** Upload one (already client-resized) photo: multipart fields `file`, `width`, `height`, optional `roomId`. */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	const user = requireUser(locals);
	const project = await getProjectOr404(locals.db, user.id, params.id);
	const form = await request.formData();

	const roomId = formId(form, 'roomId');
	if (roomId) {
		const room = await findRoomInProject(locals.db, project.id, roomId);
		if (!room) error(400, 'Unknown room');
	}

	const file = form.get('file');
	if (!(file instanceof File)) error(400, 'Missing file');
	const ext = EXTENSIONS[file.type];
	if (!ext) error(415, 'Only JPEG, PNG or WebP images are supported');
	if (file.size === 0 || file.size > MAX_BYTES) error(413, 'Image must be under 15 MB');

	const width = parseDimension(form.get('width'));
	const height = parseDimension(form.get('height'));

	const blobKey = `projects/${project.id}/${crypto.randomUUID()}.${ext}`;
	await locals.storage.put(blobKey, await file.arrayBuffer(), file.type);

	try {
		const [photo] = await locals.db
			.insert(photos)
			.values({ projectId: project.id, roomId, blobKey, width, height, createdBy: user.id, updatedBy: user.id })
			.returning();
		return Response.json(photo, { status: 201 });
	} catch (e) {
		await locals.storage.delete(blobKey);
		throw e;
	}
};
