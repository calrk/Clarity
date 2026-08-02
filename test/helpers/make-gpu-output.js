// Renders every case on the GPU and writes the results to test/gpu-output/,
// for the contact sheet's third panel.
//
// It has to run in a browser, because that is where WebGL2 is - so this drives
// the same headless Chrome the parity test uses. If there is no browser the
// script says so and exits cleanly: the sheet is still worth building without
// the GPU column, and nobody should need Chrome installed to look at it.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cases, caseName } from './cases.js';
import { openHarness } from './gpu-harness.js';
import { encodePNG } from './image.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'gpu-output');

const harness = await openHarness();

if (!harness || !harness.available) {
	if (harness) await harness.close();
	console.log('No WebGL2 browser available - skipping the GPU column.');
	process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = {};
let rendered = 0;

for (const entry of cases) {
	const name = caseName(entry);
	const result = await harness.renderGPU(entry);

	manifest[name] = { ranOnGPU: result.ranOnGPU, reason: result.reason };

	if (result.ranOnGPU) {
		//A case that fell back would just be the CPU image again, which is noise
		//on the sheet - the card says "CPU only" instead.
		const frame = {
			width: result.width,
			height: result.height,
			data: Buffer.from(result.data, 'base64')
		};
		writeFileSync(join(outDir, `${name}.png`), encodePNG(frame));
		rendered++;
	}
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, '\t'));
await harness.close();

console.log(`${rendered}/${cases.length} cases rendered on the GPU`);
