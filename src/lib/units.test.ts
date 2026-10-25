import { describe, expect, it } from 'vitest';
import { UNIT_OPTIONS, formatArea, formatLength, parseLength, unitLabel } from './units.ts';

const IN = 25.4;
const FT = 304.8;

describe('parseLength (imperial)', () => {
	it.each([
		[`12' 6"`, 12 * FT + 6 * IN],
		[`12'6"`, 12 * FT + 6 * IN],
		[`12'-6"`, 12 * FT + 6 * IN],
		[`12' 6`, 12 * FT + 6 * IN],
		[`12 6`, 12 * FT + 6 * IN],
		[`12ft 6in`, 12 * FT + 6 * IN],
		[`12 feet 6 inches`, 12 * FT + 6 * IN],
		[`12′ 6″`, 12 * FT + 6 * IN],
		[`12.5ft`, 12.5 * FT],
		[`12'`, 12 * FT],
		[`12`, 12 * FT],
		[`150in`, 150 * IN],
		[`150"`, 150 * IN],
		[`6 1/2"`, 6.5 * IN],
		[`6½"`, 6.5 * IN],
		[`3/4"`, 0.75 * IN],
		[`10' 6 1/2"`, 10 * FT + 6.5 * IN],
		[`3.2m`, 3200],
		[`320 cm`, 3200]
	])('%s', (input, mm) => {
		expect(parseLength(input, 'imperial')).toBeCloseTo(mm, 6);
	});

	it.each([``, `abc`, `6" 12'`, `1' 2' 3'`, `0`, `5/0"`, `12 6 3`, `-3`])('rejects %j', (input) => {
		expect(parseLength(input, 'imperial')).toBeNull();
	});
});

describe('parseLength (metric)', () => {
	it.each([
		[`3.25`, 3250],
		[`3.25 m`, 3250],
		[`320cm`, 3200],
		[`3200 mm`, 3200],
		[`.5m`, 500],
		[`12' 6"`, 12 * FT + 6 * IN]
	])('%s', (input, mm) => {
		expect(parseLength(input, 'metric')).toBeCloseTo(mm, 6);
	});

	it('rejects absurd values', () => {
		expect(parseLength('5000', 'metric')).toBeNull();
	});
});

describe('formatLength', () => {
	it.each([
		[12 * FT + 6 * IN, `12' 6"`],
		[12 * FT, `12'`],
		[6.5 * IN, `6 1/2"`],
		[0.75 * IN, `3/4"`],
		[10 * FT + 6.125 * IN, `10' 6 1/8"`],
		[11 * FT + 11.99 * IN, `12'`]
	])('imperial %d mm → %s', (mm, text) => {
		expect(formatLength(mm, 'imperial')).toBe(text);
	});

	it.each([
		[3250, '3.25 m'],
		[3000, '3 m'],
		[855, '85.5 cm'],
		[3255.4, '3.255 m']
	])('metric %d mm → %s', (mm, text) => {
		expect(formatLength(mm, 'metric')).toBe(text);
	});

	it('round-trips imperial formatting through the parser', () => {
		for (const mm of [100, 1234, 3048, 4572.3]) {
			const text = formatLength(mm, 'imperial');
			expect(formatLength(parseLength(text, 'imperial')!, 'imperial')).toBe(text);
		}
	});
});

describe('formatArea', () => {
	it('formats square feet and square metres', () => {
		expect(formatArea(12 * FT * 10 * FT, 'imperial')).toBe('120.0 ft²');
		expect(formatArea(3000 * 4000, 'metric')).toBe('12.00 m²');
	});
});

describe('unitLabel', () => {
	it('labels each system', () => {
		expect(unitLabel('imperial')).toBe('ft/in');
		expect(unitLabel('metric')).toBe('m/cm');
		expect(UNIT_OPTIONS).toEqual([
			{ value: 'imperial', label: 'ft/in' },
			{ value: 'metric', label: 'm/cm' }
		]);
	});
});
