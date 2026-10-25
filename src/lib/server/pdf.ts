import type { ExportMeasurement, ProjectExport } from './export.ts';
import type { BlobStorage } from './storage/types.ts';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const IMAGE_MAX_HEIGHT = 340;
const MAX_CHARS = 88;

/** A photo ready to embed: the JPEG file as stored, and what it says about itself. */
export interface PdfImage {
	bytes: Uint8Array;
	width: number;
	height: number;
	components: number;
}

/** Photos by blob key. A photo that is missing or is not a readable JPEG is listed as "not included". */
export type PdfImages = Map<string, PdfImage>;

/** Reads the size and colour components from a JPEG's start-of-frame marker; null if it is not a JPEG. */
export function readJpeg(bytes: Uint8Array): PdfImage | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let i = 2;
	while (i + 9 < bytes.length) {
		if (bytes[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = bytes[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2;
			continue;
		}
		const length = (bytes[i + 2] << 8) | bytes[i + 3];
		const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isFrame) {
			const height = (bytes[i + 5] << 8) | bytes[i + 6];
			const width = (bytes[i + 7] << 8) | bytes[i + 8];
			const components = bytes[i + 9];
			if (!width || !height || ![1, 3, 4].includes(components)) return null;
			return { bytes, width, height, components };
		}
		i += 2 + length;
	}
	return null;
}

/** Reads the project's photos from storage, one at a time; non-JPEG or missing ones are left out. */
export async function loadPdfImages(storage: BlobStorage, data: ProjectExport): Promise<PdfImages> {
	const images: PdfImages = new Map();
	for (const room of data.rooms) {
		for (const photo of room.photos) {
			const blob = await storage.get(photo.blobKey);
			if (!blob) continue;
			const image = readJpeg(new Uint8Array(await new Response(blob.body).arrayBuffer()));
			if (image) images.set(photo.blobKey, image);
		}
	}
	return images;
}

type Item =
	| { kind: 'text'; text: string; size: number; bold: boolean; gap: number; keep: number }
	| { kind: 'image'; key: string; image: PdfImage; w: number; h: number; lines: ExportMeasurement[] };

/** Latin-1 text only (what the built-in Helvetica font can show); anything else becomes "?". */
function pdfText(text: string): string {
	let out = '';
	for (const ch of text) {
		const code = ch.codePointAt(0)!;
		if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
		else if (code >= 32 && code <= 255) out += ch;
		else out += '?';
	}
	return out;
}

function wrap(text: string, indent: string): string[] {
	const lines: string[] = [];
	let current = '';
	for (const word of text.split(' ')) {
		const next = current ? `${current} ${word}` : word;
		if (next.length > MAX_CHARS - indent.length && current) {
			lines.push(indent + current);
			current = word;
		} else current = next;
	}
	lines.push(indent + current);
	return lines;
}

function layout(data: ProjectExport, images: PdfImages, date: string): Item[] {
	const items: Item[] = [];
	const text = (value: string, size: number, bold: boolean, gap: number, keep = 0) =>
		items.push({ kind: 'text', text: value, size, bold, gap, keep });

	text(data.name, 20, true, 4);
	text(`Units: ${data.unitsLabel} · Exported ${date}`, 10, false, 14);
	if (data.rooms.length === 0) text('No rooms or photos yet.', 11, false, 4);

	for (const room of data.rooms) {
		const heading = room.area ? `${room.name} - ${room.area}` : room.name;
		wrap(heading, '').forEach((line, i) => text(line, 13, true, i === 0 ? 14 : 2, i === 0 ? 120 : 0));
		if (room.photos.length === 0) text('No photos', 10, false, 2);

		for (const photo of room.photos) {
			const image = images.get(photo.blobKey);
			const scale = image ? Math.min(CONTENT_WIDTH / image.width, IMAGE_MAX_HEIGHT / image.height, 1.5) : 0;
			const imageHeight = image ? image.height * scale : 0;
			text(`Photo ${photo.number}`, 10, true, 8, imageHeight + 40);
			if (image) {
				items.push({
					kind: 'image',
					key: photo.blobKey,
					image,
					w: image.width * scale,
					h: imageHeight,
					lines: photo.measurements
				});
			} else text('The photo could not be included.', 10, false, 2);
			if (photo.measurements.length === 0) text('No measurements', 10, false, 2);
			for (const m of photo.measurements) {
				wrap(`${m.name}  ·  ${m.value || '?'}`, '    ').forEach((line) => text(line, 10, false, 2));
			}
		}
	}
	return items;
}

const num = (n: number) => n.toFixed(2);

/** PDF drawing commands for the measurement lines and their labels over a photo at (x, top - h). */
function annotationCommands(lines: ExportMeasurement[], x: number, top: number, w: number, h: number): string {
	const px = (f: number) => x + f * w;
	const py = (f: number) => top - f * h;
	let out = '1 J\n';
	for (const { line } of lines) {
		const path = `${num(px(line.x1))} ${num(py(line.y1))} m ${num(px(line.x2))} ${num(py(line.y2))} l S\n`;
		out += `0.1 0.1 0.1 RG 4.5 w ${path}1 0.84 0.04 RG 2.5 w ${path}`;
	}
	for (const m of lines) {
		const label = pdfText(m.label);
		const size = 8;
		const boxW = m.label.length * size * 0.56 + 8;
		const boxH = size + 6;
		const cx = px((m.line.x1 + m.line.x2) / 2);
		const cy = py((m.line.y1 + m.line.y2) / 2);
		const bx = Math.min(Math.max(cx - boxW / 2, x), x + w - boxW);
		const by = Math.min(Math.max(cy + 4, top - h), top - boxH);
		out += `0.1 0.1 0.1 rg ${num(bx)} ${num(by)} ${num(boxW)} ${num(boxH)} re f\n`;
		out += `1 0.84 0.04 rg BT /F2 ${size} Tf ${num(bx + 4)} ${num(by + 4)} Td (${label}) Tj ET\n`;
	}
	return out;
}

interface Page {
	content: string;
	images: Set<string>;
}

const encode = (text: string) => {
	const bytes = new Uint8Array(new ArrayBuffer(text.length));
	for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
	return bytes;
};

/**
 * A PDF (A4, Helvetica) with each room's photos, the measurement lines drawn over them, and the
 * measurements listed under each photo. JPEGs are embedded as they are, with no re-encoding.
 */
export function buildPdf(
	data: ProjectExport,
	images: PdfImages = new Map(),
	date = new Date().toISOString().slice(0, 10)
): Uint8Array<ArrayBuffer> {
	const pages: Page[] = [];
	let page: Page = { content: '', images: new Set() };
	let y = PAGE_HEIGHT - MARGIN;
	const flush = () => {
		pages.push(page);
		page = { content: '', images: new Set() };
		y = PAGE_HEIGHT - MARGIN;
	};

	const imageKeys: string[] = [];
	const imageName = (key: string) => {
		let index = imageKeys.indexOf(key);
		if (index === -1) index = imageKeys.push(key) - 1;
		return `Im${index + 1}`;
	};

	for (const item of layout(data, images, date)) {
		if (item.kind === 'text') {
			const step = item.size + item.gap;
			if (y - Math.max(step, item.keep) < MARGIN && y < PAGE_HEIGHT - MARGIN) flush();
			y -= step;
			page.content += `BT /${item.bold ? 'F2' : 'F1'} ${item.size} Tf ${MARGIN} ${num(y)} Td (${pdfText(item.text)}) Tj ET\n`;
		} else {
			if (y - item.h < MARGIN && y < PAGE_HEIGHT - MARGIN) flush();
			y -= 4;
			const top = y;
			y -= item.h + 6;
			const name = imageName(item.key);
			page.images.add(name);
			page.content += `q ${num(item.w)} 0 0 ${num(item.h)} ${MARGIN} ${num(top - item.h)} cm /${name} Do Q\n`;
			page.content += `q ${annotationCommands(item.lines, MARGIN, top, item.w, item.h)}Q\n`;
		}
	}
	flush();

	// Objects: 1 catalog, 2 page tree, 3 and 4 fonts, then one per image, then a page and a content stream per page.
	const firstImage = 5;
	const firstPage = firstImage + imageKeys.length;
	const parts: Uint8Array[] = [];
	const offsets: number[] = [];
	let size = 0;
	const add = (part: string | Uint8Array) => {
		const bytes = typeof part === 'string' ? encode(part) : part;
		parts.push(bytes);
		size += bytes.length;
	};
	const object = (id: number, body: string, stream?: Uint8Array) => {
		offsets[id] = size;
		add(`${id} 0 obj\n${body}`);
		if (stream) {
			add('\nstream\n');
			add(stream);
			add('\nendstream');
		}
		add('\nendobj\n');
	};

	add('%PDF-1.4\n%\xff\xff\xff\xff\n');
	object(1, '<< /Type /Catalog /Pages 2 0 R >>');
	object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
	object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
	object(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
	imageKeys.forEach((key, i) => {
		const image = images.get(key)!;
		const space = image.components === 1 ? '/DeviceGray' : image.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
		const decode = image.components === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
		object(
			firstImage + i,
			`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${space}` +
				` /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${image.bytes.length} >>`,
			image.bytes
		);
	});
	pages.forEach((p, i) => {
		const id = firstPage + i * 2;
		const xobjects = [...p.images].map((name) => `/${name} ${firstImage + Number(name.slice(2)) - 1} 0 R`).join(' ');
		object(
			id,
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>` +
				(xobjects ? ` /XObject << ${xobjects} >>` : '') +
				` >> /Contents ${id + 1} 0 R >>`
		);
		object(id + 1, `<< /Length ${p.content.length} >>`, encode(p.content));
	});

	const count = firstPage + pages.length * 2;
	const xref = size;
	let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
	for (let id = 1; id < count; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
	add(table + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	const out = new Uint8Array(new ArrayBuffer(size));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}
