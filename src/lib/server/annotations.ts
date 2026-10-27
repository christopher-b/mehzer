import { fail } from '@sveltejs/kit';
import { and, eq, ne } from 'drizzle-orm';
import { NAME_MAX_LENGTH } from '#lib/constants.ts';
import { parseLength } from '#lib/units.ts';
import { annotations, photos, rooms, type Project } from './db/schema.ts';
import type { Db } from './db/types.ts';
import { formString } from './forms.ts';
import { messages } from './messages.ts';
import { getPhotoNeighbours } from './photos.ts';

export interface Coords {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

function parseCoord(value: FormDataEntryValue | null): number | null {
	const n = Number(value);
	return value !== null && value !== '' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

export function parseCoords(form: FormData): Coords | null {
	const [x1, y1, x2, y2] = (['x1', 'y1', 'x2', 'y2'] as const).map((k) => parseCoord(form.get(k)));
	if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
	if (x1 === x2 && y1 === y2) return null;
	return { x1, y1, x2, y2 };
}

export interface AnnotationFields {
	name: string | null;
	/** `undefined` when the form left the value out: an edit that only renames keeps the stored length. */
	valueMm: number | null | undefined;
}

type ParseResult =
	| { ok: true; fields: AnnotationFields }
	| { ok: false; failure: ReturnType<typeof fail<{ error: string }>> };

/** Validates name / value from a form. (A measurement's room is its photo's room.) */
export function parseAnnotationFields(project: Project, form: FormData): ParseResult {
	const bad = (error: string): ParseResult => ({ ok: false, failure: fail(400, { error }) });

	const name = formString(form, 'name').trim();
	if (name.length > NAME_MAX_LENGTH) return bad(messages.annotationName);

	// An empty value clears the length; no value at all leaves it as it is.
	if (!form.has('value')) return { ok: true, fields: { name: name || null, valueMm: undefined } };
	const valueText = formString(form, 'value').trim();
	const valueMm = valueText ? parseLength(valueText, project.unitSystem) : null;
	if (valueText && valueMm === null) {
		return bad(`Couldn't understand the measurement "${valueText}"`);
	}

	return { ok: true, fields: { name: name || null, valueMm } };
}


/** A, B ... Z, AA, AB ...: the letter for the 0-based `index`. */
export function letterName(index: number): string {
	let name = '';
	for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	return name;
}

/** Room names are cut so that prefix, photo number and letters always fit in `NAME_MAX_LENGTH`. */
const ROOM_NAME_ROOM = 16;

/** `<prefix>-<letter>` with the first letter no name in `taken` already uses. */
export function nextDefaultName(prefix: string, taken: ReadonlySet<string>): string {
	for (let i = 0; ; i++) {
		const name = `${prefix}-${letterName(i)}`;
		if (!taken.has(name)) return name;
	}
}

/**
 * The name for a measurement on `photo` that was given none, like "Living Room 1-A": the room's name
 * (or "Other" with no room), the photo's place in that room, and the next letter unused in the
 * project. `exceptId` leaves a measurement's own current name out, for a rename that clears it.
 */
export async function defaultMeasurementName(
	db: Db,
	projectId: string,
	photo: { id: string; roomId: string | null },
	exceptId?: string
): Promise<string> {
	const [room, neighbours, existing] = await Promise.all([
		photo.roomId ? db.query.rooms.findFirst({ where: eq(rooms.id, photo.roomId) }) : undefined,
		getPhotoNeighbours(db, projectId, photo),
		db
			.select({ name: annotations.name })
			.from(annotations)
			.innerJoin(photos, eq(annotations.photoId, photos.id))
			.where(and(eq(photos.projectId, projectId), exceptId ? ne(annotations.id, exceptId) : undefined))
	]);
	const roomName = (room?.name ?? 'Other').slice(0, NAME_MAX_LENGTH - ROOM_NAME_ROOM);
	const taken = new Set(existing.flatMap((a) => (a.name ? [a.name] : [])));
	return nextDefaultName(`${roomName} ${neighbours.position}`, taken);
}
