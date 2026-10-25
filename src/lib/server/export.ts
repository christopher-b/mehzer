import { eq } from 'drizzle-orm';
import { computeRoomArea } from '#lib/rooms.ts';
import { canvasLabel, formatValue, measurementName } from '#lib/measurements.ts';
import { annotations, photos, rooms } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { annotationOrder, numberWithinPhoto, photoOrder, roomOrder } from './photos.ts';
import { getProjectOr404 } from './projects.ts';
import { formatArea, unitLabel, type UnitSystem } from '#lib/units.ts';

export interface ExportMeasurement {
	photo: number;
	name: string;
	value: string;
	valueMm: number | null;
	/** The text drawn on the photo, for example "Length: 12' 6\"". */
	label: string;
	/** Line end points as fractions (0 to 1) of the photo's width and height. */
	line: { x1: number; y1: number; x2: number; y2: number };
}

export interface ExportPhoto {
	number: number;
	blobKey: string;
	measurements: ExportMeasurement[];
}

export interface ExportRoom {
	name: string;
	area: string | null;
	/** The "No room" group: left out of the CSV when it has no measurements. */
	isNoRoom?: boolean;
	photos: ExportPhoto[];
	/** All measurements of the room's photos, in order. */
	measurements: ExportMeasurement[];
}

export interface ProjectExport {
	name: string;
	units: UnitSystem;
	unitsLabel: string;
	rooms: ExportRoom[];
}

/** Everything the CSV and PDF exports show, already formatted: rooms in creation order, then "No room". */
export async function buildProjectExport(db: Db, projectId: string): Promise<ProjectExport> {
	const project = await getProjectOr404(db, projectId);
	const projectPhotos = await db
		.select({ id: photos.id, blobKey: photos.blobKey, roomId: photos.roomId })
		.from(photos)
		.where(eq(photos.projectId, project.id))
		.orderBy(...photoOrder);
	const photoNumbers = new Map(projectPhotos.map((p, i) => [p.id, i + 1]));
	const rows = numberWithinPhoto(
		await db
			.select({
				id: annotations.id,
				name: annotations.name,
				valueMm: annotations.valueMm,
				x1: annotations.x1,
				y1: annotations.y1,
				x2: annotations.x2,
				y2: annotations.y2,
				roomId: photos.roomId,
				photoId: annotations.photoId
			})
			.from(annotations)
			.innerJoin(photos, eq(photos.id, annotations.photoId))
			.where(eq(photos.projectId, project.id))
			.orderBy(...photoOrder, ...annotationOrder)
	);
	const projectRooms = await db
		.select()
		.from(rooms)
		.where(eq(rooms.projectId, project.id))
		.orderBy(...roomOrder);

	const toMeasurement = (a: (typeof rows)[number]): ExportMeasurement => ({
		photo: photoNumbers.get(a.photoId) ?? 0,
		name: measurementName(a),
		value: formatValue(a.valueMm, project.unitSystem, ''),
		valueMm: a.valueMm === null ? null : Math.round(a.valueMm),
		label: canvasLabel(a, project.unitSystem),
		line: { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }
	});
	const group = (roomPhotos: typeof projectPhotos): Pick<ExportRoom, 'photos' | 'measurements'> => {
		const groupPhotos = roomPhotos.map((photo) => ({
			number: photoNumbers.get(photo.id) ?? 0,
			blobKey: photo.blobKey,
			measurements: rows.filter((a) => a.photoId === photo.id).map(toMeasurement)
		}));
		return { photos: groupPhotos, measurements: groupPhotos.flatMap((p) => p.measurements) };
	};
	const exported: ExportRoom[] = projectRooms.map((room) => {
		const area = computeRoomArea(room, rows);
		return {
			name: room.name,
			area: area === null ? null : formatArea(area, project.unitSystem),
			...group(projectPhotos.filter((p) => p.roomId === room.id))
		};
	});
	const loose = projectPhotos.filter((p) => p.roomId === null);
	if (loose.length > 0) exported.push({ name: 'No room', area: null, isNoRoom: true, ...group(loose) });

	return {
		name: project.name,
		units: project.unitSystem,
		unitsLabel: unitLabel(project.unitSystem),
		rooms: exported
	};
}

/** A file name made from the project name: letters, digits and dashes only. */
export function exportFileName(name: string, extension: string): string {
	const slug = name
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
	return `${slug || 'project'}.${extension}`;
}

function csvCell(value: string | number | null): string {
	let text = value === null ? '' : String(value);
	// Stop a spreadsheet treating text typed by the user as a formula.
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per measurement (a room with none gets one row with the measurement columns empty). */
export function toCsv(data: ProjectExport): string {
	const header = ['Room', 'Room area', 'Photo', 'Measurement', 'Value', 'Value (mm)'];
	const lines = [header];
	for (const room of data.rooms) {
		if (room.isNoRoom && room.measurements.length === 0) continue;
		if (room.measurements.length === 0) lines.push([room.name, room.area ?? '', '', '', '', '']);
		for (const m of room.measurements) {
			lines.push([room.name, room.area ?? '', String(m.photo), m.name, m.value, m.valueMm === null ? '' : String(m.valueMm)]);
		}
	}
	// The byte order mark makes Excel read the file as UTF-8.
	return '\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
