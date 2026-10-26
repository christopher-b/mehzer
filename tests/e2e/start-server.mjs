// Starts the app for the end-to-end tests: wipes the throwaway data folder, builds the app (unless
// E2E_SKIP_BUILD is set) and serves the production build with `vite preview` on a known password.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const dataDir = join(root, '.e2e-data');
const port = process.env.E2E_PORT ?? '4180';

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const env = { ...process.env };

if (!process.env.E2E_SKIP_BUILD) {
	const build = spawnSync(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit', env });
	if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, [vite, 'preview', '--port', port, '--strictPort'], {
	cwd: root,
	stdio: 'inherit',
	env: {
		...env,
		APP_PASSWORD: process.env.E2E_PASSWORD,
		SESSION_SECRET: process.env.E2E_SECRET,
		// Passkeys are bound to this address (localhost is allowed over plain http); email stays off without SMTP_HOST.
		APP_URL: `http://localhost:${port}`,
		DATABASE_PATH: join(dataDir, 'mehzur.db'),
		PHOTOS_PATH: join(dataDir, 'photos')
	}
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
