export interface StoredBlob {
	body: ReadableStream<Uint8Array>;
	contentType: string;
	size: number;
}

/** Binary object storage for photos: local filesystem (Node/Docker) or R2 (Cloudflare). */
export interface BlobStorage {
	put(key: string, data: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
	get(key: string): Promise<StoredBlob | null>;
	delete(key: string): Promise<void>;
}
