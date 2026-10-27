export const MAX_DIMENSION = 2560;
export const JPEG_QUALITY = 0.85;

/** Scale dimensions down (never up) so the longest side is at most `max`, keeping the aspect ratio. */
export function scaleToFit(width: number, height: number, max = MAX_DIMENSION) {
	const scale = Math.min(1, max / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface ResizedImage {
	blob: Blob;
	width: number;
	height: number;
}

/** The browser could not decode the file as an image. Anything else that goes wrong while resizing may be worth retrying. */
export class UnreadableImageError extends Error {}

/**
 * Downscale an image so its longest side is at most MAX_DIMENSION and re-encode as JPEG.
 * `createImageBitmap` applies EXIF orientation, so phone photos come out upright.
 */
export async function resizeImage(file: File): Promise<ResizedImage> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch((cause) => {
		throw new UnreadableImageError('Not an image', { cause });
	});
	const canvas = document.createElement('canvas');
	try {
		const { width, height } = scaleToFit(bitmap.width, bitmap.height);

		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas is not supported');
		// JPEG has no transparency; without this a transparent PNG turns black.
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, width, height);
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0, width, height);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
		);
		if (!blob) throw new Error('Could not encode image');
		return { blob, width, height };
	} finally {
		bitmap.close();
		canvas.width = canvas.height = 0; // iOS keeps a canvas's memory until it is collected
	}
}
