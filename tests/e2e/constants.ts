export const PORT = Number(process.env.E2E_PORT ?? 4180);
/** The app's setup password (APP_PASSWORD), used once to create the first account. */
export const PASSWORD = 'e2e-password';
/** The administrator account created by auth.setup.ts, which every test then signs in as. */
export const ADMIN = { name: 'E2E Admin', email: 'e2e-admin@example.com', password: 'e2e admin password' };
export const SECRET = 'e2e-session-secret-e2e-session-secret';
/** Saved signed-in browser state, written by auth.setup.ts (one file per setup project). */
export const authFile = (setupProject: 'setup' | 'setup-safari') => `.e2e-data/auth-${setupProject}.json`;
