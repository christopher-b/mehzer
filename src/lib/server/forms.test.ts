import { describe, expect, it } from 'vitest';
import { formId, formString, parseName, parseUnitSystem } from './forms.ts';

const form = (entries: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(entries)) f.set(k, v);
	return f;
};

describe('formString', () => {
	it('returns the value untrimmed', () => {
		expect(formString(form({ a: '  x ' }), 'a')).toBe('  x ');
	});
	it('returns an empty string when missing', () => {
		expect(formString(form({}), 'a')).toBe('');
	});
});

describe('formId', () => {
	it('returns the value', () => {
		expect(formId(form({ a: 'abc' }), 'a')).toBe('abc');
	});
	it('returns null when empty or missing', () => {
		expect(formId(form({ a: '' }), 'a')).toBeNull();
		expect(formId(form({}), 'a')).toBeNull();
	});
});

describe('parseName', () => {
	it('trims and returns the name', () => {
		expect(parseName('  Elm St  ')).toBe('Elm St');
	});
	it.each([null, '', '   ', undefined as never])('rejects blank %j', (value) => {
		expect(parseName(value)).toBeNull();
	});
	it('enforces the 100 character default maximum', () => {
		expect(parseName('x'.repeat(100))).toHaveLength(100);
		expect(parseName('x'.repeat(101))).toBeNull();
	});
	it('accepts a custom maximum', () => {
		expect(parseName('abcd', 3)).toBeNull();
		expect(parseName('abc', 3)).toBe('abc');
	});
});

describe('parseUnitSystem', () => {
	it('accepts only imperial and metric', () => {
		expect(parseUnitSystem('imperial')).toBe('imperial');
		expect(parseUnitSystem('metric')).toBe('metric');
		for (const bad of ['', 'cubits', 'Imperial', ' metric', null]) {
			expect(parseUnitSystem(bad)).toBeNull();
		}
	});
});
