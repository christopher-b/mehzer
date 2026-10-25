import { describe, expect, it } from 'vitest';
import { formId, formString } from './forms.ts';

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
