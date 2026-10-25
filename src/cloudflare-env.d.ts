/// <reference types="@cloudflare/workers-types" />

// Cloudflare bindings declared in wrangler.jsonc (secrets are read via `$app/env/private`).
declare namespace Cloudflare {
	interface Env {
		DB: D1Database;
		PHOTOS: R2Bucket;
	}
}
