import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * The DOM adapter, built separately from the library.
 *
 * Separate because it is the one part of Clarity that touches the DOM, and the
 * main entry point promises not to: `@calrk/clarity` has to stay importable in
 * Node, and nobody using it in a worker or a test should be paying for an
 * `<img>` helper.
 *
 * `@calrk/clarity` is left external and rewritten to `./clarity.js`, so the
 * adapter *imports* the library rather than bundling a second copy of it - it
 * is a few hundred lines next to ninety kilobytes.
 */
export default defineConfig({
	esbuild: { keepNames: true },
	build: {
		outDir: 'dist',
		//the library build runs first and this must not wipe it
		emptyOutDir: false,
		sourcemap: true,
		lib: {
			entry: resolve(root, 'src/svelte/index.ts'),
			fileName: () => 'svelte.js',
			formats: ['es']
		},
		rollupOptions: {
			external: ['@calrk/clarity'],
			output: { paths: { '@calrk/clarity': './clarity.js' } }
		}
	}
});
