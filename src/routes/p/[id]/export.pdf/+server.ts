import { buildProjectExport, exportFileName } from '#lib/server/export.ts';
import { buildPdf, loadPdfImages } from '#lib/server/pdf.ts';
import { requireUser } from '#lib/server/users.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const data = await buildProjectExport(locals.db, requireUser(locals).id, params.id);
	return new Response(buildPdf(data, await loadPdfImages(locals.storage, data)), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${exportFileName(data.name, 'pdf')}"`,
			'cache-control': 'no-store'
		}
	});
};
