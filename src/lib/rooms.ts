export interface AreaRoom {
	id: string;
	areaAAnnotationId: string | null;
	areaBAnnotationId: string | null;
}

export interface AreaAnnotation {
	id: string;
	roomId: string | null;
	valueMm: number | null;
}

/**
 * Room area in mm² = length × width from the two chosen annotations.
 * Null unless both are distinct, still assigned to this room, and have a value.
 */
export function computeRoomArea(room: AreaRoom, annotations: AreaAnnotation[]): number | null {
	const { areaAAnnotationId: aId, areaBAnnotationId: bId } = room;
	if (!aId || !bId || aId === bId) return null;
	const a = annotations.find((x) => x.id === aId);
	const b = annotations.find((x) => x.id === bId);
	if (!a || !b || a.roomId !== room.id || b.roomId !== room.id) return null;
	if (a.valueMm === null || b.valueMm === null) return null;
	return a.valueMm * b.valueMm;
}
