// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { Db } from '#lib/server/db/types.ts';
import type { BlobStorage } from '#lib/server/storage/types.ts';

declare global {
	namespace App {
		interface Error {
			status: number;
			message: string;
			/** Short id of a logged unexpected error, for the user to quote. */
			id?: string;
		}
		interface Locals {
			/** The signed-in user, or null (public pages only). */
			user: import('#lib/server/users.ts').SessionUser | null;
			sessionId: string | null;
			db: Db;
			storage: BlobStorage;
		}
		interface PageData {
			/** Set by the project and photo pages; the header shows its name. */
			/** Set for signed-in pages; the header shows the account menu. */
			user?: import('#lib/server/users.ts').SessionUser;
			project?: { id: string; name: string; unitSystem: import('#lib/units.ts').UnitSystem };
			/** Set by the project page: your role on it, and who owns it when you are a guest. */
			access?: { role: 'owner' | 'guest'; ownerName: string | null };
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
