import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { rooms } from '#lib/server/db/schema.ts';
import { buildProjectExport, exportFileName, toCsv } from '#lib/server/export.ts';
import { buildPdf, readJpeg, type PdfImages } from '#lib/server/pdf.ts';
import { createContext, seedAnnotation, seedPhoto, seedProject, seedRoom, TEST_USER } from './helpers.ts';

async function seed() {
	const { db } = createContext();
	const project = await seedProject(db, { name: 'Elm "St", 12', unitSystem: 'metric' });
	const kitchen = await seedRoom(db, project.id, 'Kitchen');
	await seedRoom(db, project.id, 'Empty');
	const photo = await seedPhoto(db, project.id, { roomId: kitchen.id });
	const loosePhoto = await seedPhoto(db, project.id);
	const length = await seedAnnotation(db, photo.id, { name: 'Length', valueMm: 4000 });
	const width = await seedAnnotation(db, photo.id, { name: '=Width', valueMm: 3000 });
	await seedAnnotation(db, loosePhoto.id, { valueMm: null });
	await db.update(rooms).set({ areaAAnnotationId: length.id, areaBAnnotationId: width.id }).where(eq(rooms.id, kitchen.id));
	return { db, project };
}

describe('export', () => {
	it('gathers rooms in creation order, then No room, with areas and numbered measurements', async () => {
		const { db, project } = await seed();
		const data = await buildProjectExport(db, TEST_USER.id, project.id);
		expect(data.rooms.map((r) => r.name)).toEqual(['Kitchen', 'Empty', 'No room']);
		expect(data.rooms[0].area).toBe('12.00 m²');
		expect(data.rooms[0].measurements.map((m) => [m.photo, m.name, m.value])).toEqual([
			[1, 'Length', '4 m'],
			[1, '=Width', '3 m']
		]);
		expect(data.rooms[2].measurements[0]).toMatchObject({ photo: 2, name: 'Measurement 1', value: '' });
	});

	it('writes a CSV that quotes, guards formulas and keeps rooms without measurements', async () => {
		const { db, project } = await seed();
		const csv = toCsv(await buildProjectExport(db, TEST_USER.id, project.id));
		const lines = csv.replace('\uFEFF', '').trimEnd().split('\r\n');
		expect(lines[0]).toBe('Room,Room area,Photo,Measurement,Value,Value (mm)');
		expect(lines).toContain("Kitchen,12.00 m²,1,'=Width,3 m,3000");
		expect(lines).toContain('Empty,,,,,');
		expect(lines).toContain('No room,,2,Measurement 1,,');
	});

	it('makes a safe file name', () => {
		expect(exportFileName('Elm "St", 12 / ü', 'csv')).toBe('elm-st-12-u.csv');
		expect(exportFileName('???', 'pdf')).toBe('project.pdf');
	});

	it('writes a well-formed PDF, escaping text and starting new pages', async () => {
		const { db, project } = await seed();
		const data = await buildProjectExport(db, TEST_USER.id, project.id);
		data.name = 'A (tricky) \\ name ☃';
		const text = new TextDecoder('latin1').decode(buildPdf(data, new Map(), '2026-10-24'));
		expect(text.startsWith('%PDF-1.4')).toBe(true);
		expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
		expect(text).toContain('(A \\(tricky\\) \\\\ name ?) Tj');
		const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
		expect(text.slice(startxref, startxref + 4)).toBe('xref');

		for (let i = 0; i < 80; i++) data.rooms.push({ name: `Room ${i}`, area: null, photos: [], measurements: [] });
		const big = new TextDecoder('latin1').decode(buildPdf(data));
		expect(Number(/\/Count (\d+)/.exec(big)![1])).toBeGreaterThan(1);
	});

	it('embeds JPEG photos with the measurement lines and labels drawn over them', async () => {
		const { db, project } = await seed();
		const data = await buildProjectExport(db, TEST_USER.id, project.id);
		const key = data.rooms[0].photos[0].blobKey;
		const jpeg = fakeJpeg(640, 480, 3);
		const images: PdfImages = new Map([[key, readJpeg(jpeg)!]]);
		const text = new TextDecoder('latin1').decode(buildPdf(data, images, '2026-10-24'));
		expect(text).toContain('/Subtype /Image /Width 640 /Height 480 /ColorSpace /DeviceRGB');
		expect(text).toContain('/Filter /DCTDecode');
		expect(text).toContain('/Im1 Do');
		expect(text).toContain('(Length: 4 m) Tj');
		expect(text).toContain('The photo could not be included.'); // the other photo has no image
		const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
		expect(text.slice(startxref, startxref + 4)).toBe('xref');
	});

	it('reads the size of a JPEG and refuses anything else', () => {
		expect(readJpeg(fakeJpeg(1200, 800, 3))).toMatchObject({ width: 1200, height: 800, components: 3 });
		expect(readJpeg(fakeJpeg(10, 10, 1))).toMatchObject({ components: 1 });
		expect(readJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
		expect(readJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
	});
});

/** Just enough of a JPEG (start, size header, end) for the size to be read; not a viewable image. */
function fakeJpeg(width: number, height: number, components: number): Uint8Array {
	return new Uint8Array([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
		0xff, 0xc0, 0x00, 8 + components * 3, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, components,
		...Array.from({ length: components * 3 }, () => 1),
		0xff, 0xd9
	]);
}
