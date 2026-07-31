// Regenerates test/fixtures/*.png. Run with `npm run test:fixtures`.
//
// The inputs are synthetic and generated from a fixed seed so they are
// reproducible and reviewable in a diff, rather than opaque binary blobs.
// Each one targets a different class of filter.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NodeImageData, writePNG } from './image.js';
import { seededRandom } from '../../dist/clarity.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'fixtures');

const W = 64;
const H = 48;

function build(width, height, fn) {
	const image = new NodeImageData(width, height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const [r, g, b, a = 255] = fn(x, y, width, height);
			image.data[i] = r;
			image.data[i + 1] = g;
			image.data[i + 2] = b;
			image.data[i + 3] = a;
		}
	}
	return image;
}

// 1. photo-like: smooth gradients plus a little grain, so colour statistics
//    resemble a real image. Exercises the quantiser, HSV, blur, thresholds.
const grain = seededRandom(0x5eed);
const photo = build(W, H, (x, y) => {
	const sky = y < H * 0.55;
	const n = () => (grain() - 0.5) * 14;
	if (sky) {
		return [90 + x * 0.35 + n(), 140 + y * 0.6 + n(), 215 - y * 0.9 + n()];
	}
	const hill = Math.sin(x * 0.2) * 4;
	return [45 + hill + n(), 105 + y * 0.4 + n(), 40 + n()];
});

// 2. hard edges: flat blocks with sharp boundaries and a thin line. This is
//    what edge detection, thresholding and dot removal should key off.
const edges = build(W, H, (x, y) => {
	if (y === 12 || x === 40) return [255, 255, 255];      // 1px lines
	if (x < W / 3) return [20, 20, 20];
	if (x < (W * 2) / 3) return [200, 200, 200];
	if (y < H / 2) return [90, 30, 30];
	return [30, 90, 30];
});

// 3. height map: a smooth single-channel surface with a couple of peaks, for
//    the HeightMap filters (normal generation, contours, normal intensity).
const heightmap = build(W, H, (x, y) => {
	const peak = (cx, cy, r) => {
		const d = Math.hypot(x - cx, y - cy);
		return Math.max(0, 1 - d / r);
	};
	const h = Math.min(1, peak(20, 18, 22) * 0.9 + peak(46, 32, 16) * 0.7);
	const v = Math.round(h * 255);
	return [v, v, v];
});

// 4. alpha: partially transparent content, so filters that assume opaque
//    input, or that rebuild the alpha channel, are exercised honestly.
const alpha = build(W, H, (x, y) => {
	const a = Math.round((x / W) * 255);
	return [220, 60, 160, y < 6 ? 0 : a];
});

// 5. odd dimensions, deliberately prime-ish and not divisible by the tile
//    sizes filters like to assume. Pixelate walks `size` down until it divides
//    the height, Tiler steps by 2, and the #1 sweep was full of boundary
//    off-by-ones - this is the fixture that catches that class.
const odd = build(33, 25, (x, y) => [
	(x * 7) % 256,
	(y * 11) % 256,
	((x + y) * 5) % 256
]);

// 6. second input, for the dual-input filters. Deliberately different in
//    structure from `photo` so blends and masks produce visible results.
const second = build(W, H, (x, y) => {
	const disc = Math.hypot(x - 30, y - 24) < 15;
	return disc ? [240, 240, 240] : [25, 25, 25];
});

const fixtures = { photo, edges, heightmap, alpha, odd, second };

for (const [name, image] of Object.entries(fixtures)) {
	const path = join(out, `${name}.png`);
	writePNG(path, image);
	console.log(`  ${name.padEnd(10)} ${image.width}x${image.height}  ${path}`);
}
console.log(`\n${Object.keys(fixtures).length} fixtures written`);
