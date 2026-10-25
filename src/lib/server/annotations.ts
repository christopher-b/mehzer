import { fail } from '@sveltejs/kit';
import { NAME_MAX_LENGTH } from '#lib/constants.ts';
import { parseLength } from '#lib/units.ts';
import type { Project } from './db/schema.ts';
import { formString } from './forms.ts';
import { messages } from './messages.ts';

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
	valueMm: number | null;
}

type ParseResult =
	| { ok: true; fields: AnnotationFields }
	| { ok: false; failure: ReturnType<typeof fail<{ error: string }>> };

/** Validates name / value from a form. (A measurement's room is its photo's room.) */
export function parseAnnotationFields(project: Project, form: FormData): ParseResult {
	const bad = (error: string): ParseResult => ({ ok: false, failure: fail(400, { error }) });

	const name = formString(form, 'name').trim();
	if (name.length > NAME_MAX_LENGTH) return bad(messages.annotationName);

	const valueText = formString(form, 'value').trim();
	const valueMm = valueText ? parseLength(valueText, project.unitSystem) : null;
	if (valueText && valueMm === null) {
		return bad(`Couldn't understand the measurement "${valueText}"`);
	}

	return { ok: true, fields: { name: name || null, valueMm } };
}
