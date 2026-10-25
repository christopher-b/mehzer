import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// DEPLOY_TARGET=cloudflare builds for Cloudflare Workers; anything else builds the Node/Docker server.
const target = process.env.DEPLOY_TARGET === 'cloudflare' ? 'cloudflare' : 'node';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: target === 'cloudflare' ? adapterCloudflare() : adapterNode({ out: 'build' })
		})
	],
	define: {
		__DEPLOY_TARGET__: JSON.stringify(target)
	},
	test: {
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts', 'src/routes/**/*.server.ts'],
			exclude: ['src/**/*.test.ts', 'src/lib/types.ts', 'src/lib/server/db/types.ts']
		}
	}
});
