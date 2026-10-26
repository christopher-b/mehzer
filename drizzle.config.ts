import { defineConfig } from 'drizzle-kit';

// Migrations are plain SQLite SQL, applied by the server on startup.
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_PATH ?? './data/mehzur.db'
	}
});
