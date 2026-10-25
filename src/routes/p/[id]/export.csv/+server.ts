import { buildProjectExport, exportFileName, toCsv } from '#lib/server/export.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const data = await buildProjectExport(locals.db, params.id);
	return new Response(toCsv(data), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${exportFileName(data.name, 'csv')}"`,
			'cache-control': 'no-store'
		}
	});
};
