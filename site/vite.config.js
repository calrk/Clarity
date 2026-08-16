import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

import seo from './seo.js';

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
	// bakes the metadata a crawler needs into index.html, from the same
	// catalogue the palette is built from - see site/seo.js
	plugins: [seo()],
	server: {
		//5173 is Vite's default and so is whatever else is already running;
		//strictPort because the point of pinning it is knowing where the
		//playground is, and silently hopping to 5175 gives that back up
		port: 5174,
		strictPort: true
	},
	//`npm run site:preview` defaults to 4173, which every other project's
	//preview also asks for - eight of these had stacked up on 4173 upwards,
	//each one silently climbing past the last. strictPort turns a second run
	//into an error rather than another orphan
	preview: {
		port: 4174,
		strictPort: true
	},
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
