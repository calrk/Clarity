import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * The playground's build, separate from the library's.
 *
 * `@calrk/clarity` resolves to the *source*, not `dist/`, so `npm run site` is
 * a live edit loop across both - change a shader, see it on the page. The
 * published bundle is what a consumer gets; this is what the author gets.
 */
export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	base: '/',
	resolve: {
		alias: {
			'@calrk/clarity': fileURLToPath(new URL('../src/index.ts', import.meta.url))
		}
	},
	esbuild: {
		//the pipeline reads `filter.constructor.name` to report which stage fell
		//back to the CPU, and minification renames classes to `lt`
		keepNames: true
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		target: 'es2022'
	}
});
