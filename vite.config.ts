import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dts from 'vite-plugin-dts';

const root = dirname(fileURLToPath(import.meta.url));

// Minification strips source comments, so the notice for the one piece of
// third-party code we still bundle has to be re-attached here. MIT requires it
// to travel with every copy.
const banner = `/*!
 * Clarity - canvas image filter library
 * Copyright (c) Clark. MIT licensed.
 * https://github.com/calrk/clarity
 *
 * Bundles StackBlur by Mario Klingemann <mario@quasimondo.com>
 * https://www.quasimondo.com/StackBlurForCanvas - Copyright (c) 2010, MIT licensed.
 */`;

export default defineConfig({
	server: {
		port: 8080,
		// replaces the old gulp-connect task, which bound port 80 and needed admin
		open: '/examples/index.html'
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			output: { banner }
		},
		lib: {
			entry: resolve(root, 'src/index.ts'),
			// the global the UMD and IIFE builds expose, so existing pages keep working
			name: 'CLARITY',
			// - clarity.js         ESM, what `import` resolves to
			// - clarity.umd.cjs    CJS/UMD, what `require()` resolves to. `.cjs` because
			//                      package.json sets "type": "module"
			// - clarity.global.js  plain <script> for the examples; `.cjs` risks being
			//                      served with a MIME type browsers refuse to execute
			fileName: (format) =>
				({
					es: 'clarity.js',
					umd: 'clarity.umd.cjs',
					iife: 'clarity.global.js'
				})[format] ?? `clarity.${format}.js`,
			formats: ['es', 'umd', 'iife']
		}
	},
	plugins: [
		dts({
			entryRoot: resolve(root, 'src'),
			include: [resolve(root, 'src/**/*.ts')],
			outDir: resolve(root, 'dist')
		})
	]
});
