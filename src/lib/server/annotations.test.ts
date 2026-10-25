import { describe, expect, it } from 'vitest';
import type { Project } from './db/schema.ts';
import { parseAnnotationFields, parseCoords } from './annotations.ts';

const coords = (o: Record<string, string>) => {
	const form = new FormData();
	for (const [k, v] of Object.entries(o)) form.set(k, v);
	return parseCoords(form);
};

describe('parseCoords', () => {
	it('accepts normalized endpoints', () => {
		expect(coords({ x1: '0.1', y1: '0.2', x2: '0.8', y2: '0.9' })).toEqual({
			x1: 0.1,
			y1: 0.2,
			x2: 0.8,
			y2: 0.9
		});
	});

	it('accepts the 0 and 1 boundaries', () => {
		expect(coords({ x1: '0', y1: '0', x2: '1', y2: '1' })).not.toBeNull();
	});

	it.each([
		['out of range high', { x1: '0.1', y1: '0.2', x2: '1.0001', y2: '0.2' }],
		['out of range low', { x1: '-0.1', y1: '0.2', x2: '0.5', y2: '0.2' }],
		['missing field', { x1: '0.1', y1: '0.2', x2: '0.5' }],
		['empty string', { x1: '', y1: '0.2', x2: '0.5', y2: '0.5' }],
		['not a number', { x1: 'abc', y1: '0.2', x2: '0.5', y2: '0.5' }],
		['NaN', { x1: 'NaN', y1: '0.2', x2: '0.5', y2: '0.5' }],
		['Infinity', { x1: '0.1', y1: '0.2', x2: 'Infinity', y2: '0.5' }],
		['zero-length line', { x1: '0.3', y1: '0.3', x2: '0.3', y2: '0.3' }]
	])('rejects %s', (_label, input) => {
		expect(coords(input)).toBeNull();
	});

	it('allows a purely horizontal or vertical line', () => {
		expect(coords({ x1: '0.1', y1: '0.5', x2: '0.9', y2: '0.5' })).not.toBeNull();
		expect(coords({ x1: '0.5', y1: '0.1', x2: '0.5', y2: '0.9' })).not.toBeNull();
	});
});

const project = (unitSystem: Project['unitSystem']): Project => ({
	id: 'p',
	name: 'P',
	unitSystem,
	createdAt: new Date(),
	ownerId: null,
	createdBy: null,
	updatedBy: null
});
const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};

describe('parseAnnotationFields', () => {
	it('parses name and value using the project units', () => {
		const imperial = parseAnnotationFields(project('imperial'), form({ name: ' Width ', value: `12'` }));
		expect(imperial.ok && imperial.fields.name).toBe('Width');
		expect(imperial.ok && imperial.fields.valueMm).toBeCloseTo(3657.6, 6);

		const metric = parseAnnotationFields(project('metric'), form({ name: 'W', value: '3.2' }));
		expect(metric).toEqual({ ok: true, fields: { name: 'W', valueMm: 3200 } });
	});

	it('allows blank name and value', () => {
		expect(parseAnnotationFields(project('imperial'), form({}))).toEqual({
			ok: true,
			fields: { name: null, valueMm: null }
		});
		expect(parseAnnotationFields(project('imperial'), form({ name: '   ', value: '  ' }))).toEqual({
			ok: true,
			fields: { name: null, valueMm: null }
		});
	});

	it('rejects an unreadable value with a 400', () => {
		const result = parseAnnotationFields(project('imperial'), form({ value: 'banana' }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.failure.status).toBe(400);
			expect(result.failure.data.error).toContain('banana');
		}
	});

	it('rejects a name over 100 characters but accepts exactly 100', () => {
		expect(parseAnnotationFields(project('imperial'), form({ name: 'x'.repeat(100) })).ok).toBe(true);
		expect(parseAnnotationFields(project('imperial'), form({ name: 'x'.repeat(101) })).ok).toBe(false);
	});

	it('ignores any roomId: a measurement takes its room from its photo', () => {
		const result = parseAnnotationFields(project('imperial'), form({ roomId: 'whatever' }));
		expect(result).toEqual({ ok: true, fields: { name: null, valueMm: null } });
	});
});
