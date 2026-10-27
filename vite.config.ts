import adapterNode from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapterNode({ out: 'build' }),
			// Kit adds nonces to its own inline scripts and styles. Inline `style` attributes (from `style:`
			// in the templates) are not covered by a nonce, so they get their own directive.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'img-src': ['self', 'blob:', 'data:'],
					'style-src-attr': ['unsafe-inline'],
					'form-action': ['self'],
					'frame-ancestors': ['none'],
					'object-src': ['none'],
					'base-uri': ['self']
				}
			}
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts', 'src/routes/**/*.server.ts'],
			exclude: ['src/**/*.test.ts', 'src/lib/types.ts', 'src/lib/server/db/types.ts']
		}
	}
});
