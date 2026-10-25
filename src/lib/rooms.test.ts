import { describe, expect, it } from 'vitest';
import { computeRoomArea } from './rooms.ts';

const annotations = [
	{ id: 'a', roomId: 'r1', valueMm: 4000 },
	{ id: 'b', roomId: 'r1', valueMm: 3000 },
	{ id: 'c', roomId: 'r2', valueMm: 2000 },
	{ id: 'd', roomId: 'r1', valueMm: null }
];
const room = (a: string | null, b: string | null) => ({
	id: 'r1',
	areaAAnnotationId: a,
	areaBAnnotationId: b
});

describe('computeRoomArea', () => {
	it('multiplies the two measurements', () => {
		expect(computeRoomArea(room('a', 'b'), annotations)).toBe(12_000_000);
	});
	it('is null when unset or the same measurement twice', () => {
		expect(computeRoomArea(room(null, 'b'), annotations)).toBeNull();
		expect(computeRoomArea(room('a', null), annotations)).toBeNull();
		expect(computeRoomArea(room('a', 'a'), annotations)).toBeNull();
	});
	it('is null if a measurement left the room, has no value, or is missing', () => {
		expect(computeRoomArea(room('a', 'c'), annotations)).toBeNull();
		expect(computeRoomArea(room('a', 'd'), annotations)).toBeNull();
		expect(computeRoomArea(room('a', 'zzz'), annotations)).toBeNull();
	});
});
