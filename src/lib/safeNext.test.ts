import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext.ts';

describe('safeNext', () => {
	it.each([
		['null', null],
		['empty', ''],
		['protocol-relative', '//evil.com'],
		['backslash', '/\\evil.com'],
		['slash then backslash', '/\\/evil.com'],
		['tab', '/\t/evil.com'],
		['newline', '/\n/evil.com'],
		['carriage return', '/\r/evil.com'],
		['absolute url', 'https://evil.com'],
		['javascript url', 'javascript:alert(1)'],
		['no leading slash', 'p/1']
	])('sends %s to the home page', (_name, value) => {
		expect(safeNext(value)).toBe('/');
	});

	it('keeps an address inside the app unchanged', () => {
		expect(safeNext('/p/abc?x=1#y')).toBe('/p/abc?x=1#y');
		expect(safeNext('/')).toBe('/');
		expect(safeNext('/p/abc/photo/def?select=1')).toBe('/p/abc/photo/def?select=1');
	});
});
