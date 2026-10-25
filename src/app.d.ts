// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { Db } from '#lib/server/db/types.ts';
import type { BlobStorage } from '#lib/server/storage/types.ts';

declare global {
	const __DEPLOY_TARGET__: 'node' | 'cloudflare';

	namespace App {
		interface Error {
			status: number;
			message: string;
			/** Short id of a logged unexpected error, for the user to quote. */
			id?: string;
		}
		interface Locals {
			authenticated: boolean;
			db: Db;
			storage: BlobStorage;
		}
		interface PageData {
			/** Set by the project and photo pages; the header shows its name. */
			project?: { id: string; name: string; unitSystem: import('#lib/units.ts').UnitSystem };
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
