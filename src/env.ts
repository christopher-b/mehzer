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
		description: 'Setup password: used once at /setup to create the administrator',
		schema: required('APP_PASSWORD')
	},
	SESSION_SECRET: {
		description: 'Secret used to sign session cookies (long random string)',
		schema: required('SESSION_SECRET')
	},
	DATABASE_PATH: {
		description: 'Node/Docker only: SQLite database file',
		schema: withDefault('./data/mehzur.db')
	},
	PHOTOS_PATH: {
		description: 'Node/Docker only: directory for uploaded photos',
		schema: withDefault('./data/photos')
	},
	APP_URL: {
		description: 'Public address of the app, used in links sent by email (for example https://mehzur.cbennell.com)',
		schema: withDefault('')
	},
	SMTP_HOST: {
		description: 'Node/Docker only: SMTP server for invite and password-reset emails (leave empty to turn email off)',
		schema: withDefault('')
	},
	SMTP_PORT: {
		description: 'SMTP port (587 uses STARTTLS, 465 uses TLS)',
		schema: withDefault('587')
	},
	SMTP_USER: {
		description: 'SMTP user name',
		schema: withDefault('')
	},
	SMTP_PASSWORD: {
		description: 'SMTP password or token',
		schema: withDefault('')
	},
	MAIL_FROM: {
		description: 'Sender of emails',
		schema: withDefault('Mehzur <mehzur@cbennell.com>')
	},
	MIGRATIONS_PATH: {
		description: 'Node/Docker only: directory containing Drizzle SQL migrations',
		schema: withDefault('./drizzle')
	}
});
