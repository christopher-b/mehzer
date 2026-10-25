export const PORT = Number(process.env.E2E_PORT ?? 4180);
export const PASSWORD = 'e2e-password';
export const SECRET = 'e2e-session-secret-e2e-session-secret';
/** Saved signed-in browser state, written by auth.setup.ts (one file per setup project). */
export const authFile = (setupProject: 'setup' | 'setup-safari') => `.e2e-data/auth-${setupProject}.json`;
