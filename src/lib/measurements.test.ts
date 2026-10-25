import { describe, expect, it } from 'vitest';
import { canvasLabel, formatValue, measurementName, optionLabel } from './measurements.ts';

describe('formatValue', () => {
	it('formats, or returns the fallback', () => {
		expect(formatValue(3048, 'imperial', '—')).toBe("10'");
		expect(formatValue(null, 'imperial', '—')).toBe('—');
	});
});

describe('canvasLabel', () => {
	it('shows name and value, or only the value', () => {
		expect(canvasLabel({ name: 'Wall', valueMm: 3048 }, 'imperial')).toBe("Wall: 10'");
		expect(canvasLabel({ name: null, valueMm: 1500 }, 'metric')).toBe('1.5 m');
		expect(canvasLabel({ name: '', valueMm: null }, 'metric')).toBe('?');
		expect(canvasLabel({ name: 'Wall', valueMm: null }, 'metric')).toBe('Wall: ?');
	});
});

describe('optionLabel', () => {
	it('uses the name or "Measurement x"', () => {
		expect(optionLabel({ name: 'Wall', valueMm: 1500, number: 2 }, 'metric')).toBe('Wall · 1.5 m');
		expect(optionLabel({ name: null, valueMm: 1500, number: 2 }, 'metric')).toBe('Measurement 2 · 1.5 m');
		expect(optionLabel({ name: null, valueMm: null, number: 2 }, 'metric')).toBe('Measurement 2 · ?');
	});
});

describe('measurementName', () => {
	it('falls back to the number', () => {
		expect(measurementName({ name: 'Wall', number: 1 })).toBe('Wall');
		expect(measurementName({ name: null, number: 3 })).toBe('Measurement 3');
	});
});
