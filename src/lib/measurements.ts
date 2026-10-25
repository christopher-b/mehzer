import { formatLength, type UnitSystem } from './units.ts';

interface Measured {
	name: string | null;
	valueMm: number | null;
}

/** The formatted length, or `missing` when the measurement has no value yet. */
export function formatValue(valueMm: number | null, units: UnitSystem, missing: string): string {
	return valueMm === null ? missing : formatLength(valueMm, units);
}

/** Text drawn on the photo: "Name: value", or just the value when unnamed. */
export function canvasLabel(m: Measured, units: UnitSystem): string {
	const value = formatValue(m.valueMm, units, '?');
	return m.name ? `${m.name}: ${value}` : value;
}

/** A measurement's name; unnamed ones are "Measurement x" (x = position on its photo). */
export function measurementName(m: { name: string | null; number: number }): string {
	return m.name ?? `Measurement ${m.number}`;
}

/** Text of an option in a measurement dropdown: "Name · value". */
export function optionLabel(m: Measured & { number: number }, units: UnitSystem): string {
	return `${measurementName(m)} · ${formatValue(m.valueMm, units, '?')}`;
}
