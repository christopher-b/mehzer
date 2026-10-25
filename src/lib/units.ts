export const UNIT_SYSTEMS = ['imperial', 'metric'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export function unitLabel(system: UnitSystem): string {
	return system === 'imperial' ? 'ft/in' : 'm/cm';
}

export const UNIT_OPTIONS = UNIT_SYSTEMS.map((value) => ({ value, label: unitLabel(value) }));

const MM_PER_INCH = 25.4;
const MM_PER_FOOT = 304.8;
const MM2_PER_FT2 = MM_PER_FOOT * MM_PER_FOOT;
const MAX_MM = 1_000_000; // 1 km: anything larger is surely a typo

const UNICODE_FRACTIONS: Record<string, string> = {
	'½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8'
};

const METRIC = /^(\d+(?:\.\d+)?|\.\d+)\s*(mm|cm|m)$/i;

interface Token {
	value: number;
	unit: 'ft' | 'in' | null;
	fraction: boolean;
}

function parseImperial(input: string, bareIsFeet: boolean): number | null {
	let s = input
		.toLowerCase()
		.replace(/[½¼¾⅛⅜⅝⅞]/g, (c) => UNICODE_FRACTIONS[c])
		.replace(/[′’‘`]/g, "'")
		.replace(/[″”“]|''/g, '"')
		.replace(/\s*(feet|foot|ft)\b\.?/g, "'")
		.replace(/\s*(inches|inch|in)\b\.?/g, '"');

	const tokens: Token[] = [];
	const re = /\s*(\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*(\d+))?\s*(['"])?\s*[-,]?/y;
	let pos = 0;
	while (pos < s.length) {
		re.lastIndex = pos;
		const m = re.exec(s);
		if (!m || m[0].length === 0) {
			if (s.slice(pos).trim() === '') break;
			return null;
		}
		pos = re.lastIndex;
		const denom = m[2] ? Number(m[2]) : 1;
		if (denom === 0) return null;
		tokens.push({
			value: Number(m[1]) / denom,
			unit: m[3] === "'" ? 'ft' : m[3] === '"' ? 'in' : null,
			fraction: Boolean(m[2])
		});
	}
	if (tokens.length === 0) return null;

	// Merge "6 1/2"" style: a fraction joins the whole number in front of it.
	const merged: Token[] = [];
	for (const t of tokens) {
		const prev = merged.at(-1);
		if (t.fraction && prev && !prev.fraction && (prev.unit === null || t.unit === null || prev.unit === t.unit)) {
			prev.value += t.value;
			prev.unit = prev.unit ?? t.unit;
			prev.fraction = true;
		} else {
			merged.push({ ...t });
		}
	}

	if (merged.length > 2) return null;
	if (merged.length === 2) {
		const [a, b] = merged;
		if ((a.unit ?? 'ft') !== 'ft' || (b.unit ?? 'in') !== 'in') return null;
		return a.value * MM_PER_FOOT + b.value * MM_PER_INCH;
	}
	const [t] = merged;
	const unit = t.unit ?? (bareIsFeet ? 'ft' : 'in');
	return t.value * (unit === 'ft' ? MM_PER_FOOT : MM_PER_INCH);
}

/**
 * Parse a length typed by the user into millimetres.
 * Metric (`3.2m`, `320 cm`, `3200mm`) and imperial (`12' 6"`, `12ft 6in`, `6 1/2"`, `150in`)
 * notation work in either project; a bare number means feet (imperial) or metres (metric).
 */
export function parseLength(input: string, system: UnitSystem): number | null {
	const s = input.trim();
	if (!s) return null;

	let mm: number | null;
	const metric = METRIC.exec(s);
	if (metric) {
		const factor = { mm: 1, cm: 10, m: 1000 }[metric[2].toLowerCase() as 'mm' | 'cm' | 'm'];
		mm = Number(metric[1]) * factor;
	} else if (system === 'metric' && /^(\d+(?:\.\d+)?|\.\d+)$/.test(s)) {
		mm = Number(s) * 1000;
	} else {
		mm = parseImperial(s, true);
	}

	return mm !== null && Number.isFinite(mm) && mm > 0 && mm <= MAX_MM ? mm : null;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** Imperial lengths round to the nearest 1/8"; metric shows cm under 1 m, else m. */
export function formatLength(mm: number, system: UnitSystem): string {
	if (system === 'metric') {
		if (mm < 1000) return `${trim((mm / 10).toFixed(1))} cm`;
		return `${trim((mm / 1000).toFixed(3))} m`;
	}

	const eighths = Math.round((mm / MM_PER_INCH) * 8);
	const feet = Math.floor(eighths / 96);
	const rem = eighths - feet * 96;
	const inches = Math.floor(rem / 8);
	const frac = rem % 8;

	let inchStr = String(inches);
	if (frac) {
		const g = gcd(frac, 8);
		inchStr = `${inches ? `${inches} ` : ''}${frac / g}/${8 / g}`;
	}
	if (feet === 0) return `${inchStr}"`;
	if (rem === 0) return `${feet}'`;
	return `${feet}' ${inchStr}"`;
}

export function formatArea(mm2: number, system: UnitSystem): string {
	return system === 'metric'
		? `${(mm2 / 1_000_000).toFixed(2)} m²`
		: `${(mm2 / MM2_PER_FT2).toFixed(1)} ft²`;
}

export function lengthPlaceholder(system: UnitSystem): string {
	return system === 'metric' ? 'e.g. 3.25 m or 320 cm' : `e.g. 12' 6" or 150 in`;
}

function trim(n: string): string {
	return n.includes('.') ? n.replace(/0+$/, '').replace(/\.$/, '') : n;
}
