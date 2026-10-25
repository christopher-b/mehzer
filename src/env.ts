import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

const required = (name: string) => (value: string | undefined) => {
	if (building) return value ?? '';
	if (!value) throw new Error(`${name} must be set`);
	return value;
};

const withDefault = (fallback: string) => (value: string | undefined) => value || fallback;

export const variables = defineEnvVars({
	APP_PASSWORD: {
		description: 'Password for the single app user',
		schema: required('APP_PASSWORD')
	},
	SESSION_SECRET: {
		description: 'Secret used to sign session cookies (long random string)',
		schema: required('SESSION_SECRET')
	},
	DATABASE_PATH: {
		description: 'Node/Docker only: SQLite database file',
		schema: withDefault('./data/rooms.db')
	},
	PHOTOS_PATH: {
		description: 'Node/Docker only: directory for uploaded photos',
		schema: withDefault('./data/photos')
	},
	MIGRATIONS_PATH: {
		description: 'Node/Docker only: directory containing Drizzle SQL migrations',
		schema: withDefault('./drizzle')
	}
});
