import { describe, expect, it } from 'vitest';
import { MAX_DIMENSION, scaleToFit } from './image.ts';

describe('scaleToFit', () => {
	it('leaves small images alone (never upscales)', () => {
		expect(scaleToFit(800, 600)).toEqual({ width: 800, height: 600 });
		expect(scaleToFit(MAX_DIMENSION, 100)).toEqual({ width: MAX_DIMENSION, height: 100 });
	});

	it('scales a large landscape photo so the long side is the max', () => {
		expect(scaleToFit(4000, 3000)).toEqual({ width: 2560, height: 1920 });
	});

	it('scales a large portrait photo by its height', () => {
		expect(scaleToFit(3000, 4000)).toEqual({ width: 1920, height: 2560 });
	});

	it('keeps the aspect ratio for a 12 MP phone photo', () => {
		const { width, height } = scaleToFit(4032, 3024);
		expect(width).toBe(2560);
		expect(Math.abs(width / height - 4032 / 3024)).toBeLessThan(0.001);
	});

	it('honours a custom maximum', () => {
		expect(scaleToFit(1000, 500, 100)).toEqual({ width: 100, height: 50 });
	});

	it('never produces a zero dimension for extreme panoramas', () => {
		expect(scaleToFit(20000, 2)).toEqual({ width: 2560, height: 1 });
	});
});
