import { NAME_MAX_LENGTH } from '#lib/constants.ts';
import { UNIT_SYSTEMS, type UnitSystem } from '#lib/units.ts';

/** A form field as a string ('' when missing). Not trimmed: callers that want that call `.trim()`. */
export function formString(form: FormData, key: string): string {
	return String(form.get(key) ?? '');
}

/** An optional id field: '' or missing becomes null. */
export function formId(form: FormData, key: string): string | null {
	return formString(form, key) || null;
}

/** A trimmed, non-empty name of at most `max` characters, or null. */
export function parseName(value: FormDataEntryValue | null, max = NAME_MAX_LENGTH): string | null {
	const name = String(value ?? '').trim();
	return name && name.length <= max ? name : null;
}

export function parseUnitSystem(value: FormDataEntryValue | null): UnitSystem | null {
	return (UNIT_SYSTEMS as readonly unknown[]).includes(value) ? (value as UnitSystem) : null;
}
