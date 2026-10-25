import { defineConfig } from 'drizzle-kit';

// Migrations are plain SQLite SQL, applied by the Node server on startup
// and by `wrangler d1 migrations apply` on Cloudflare (migrations_dir = "drizzle").
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: process.env.DATABASE_PATH ?? './data/mehzur.db'
	}
});
