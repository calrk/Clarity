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

// 4. alpha: partially transparent content, so filters that assume opaque input,
//    or that rebuild the alpha channel, are exercised honestly. RGB has to vary
//    independently of alpha - a constant colour makes Blur a no-op here and the
//    case proves nothing.
const alpha = build(W, H, (x, y) => {
	const a = Math.round((x / W) * 255);
	const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
	return [
		checker ? 230 : 40,
		60 + y * 3,
		checker ? 80 : 200,
		y < 6 ? 0 : a
	];
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

// 7. binary with salt-and-pepper noise. Morphology open is meant to run *after* an
//    edge detector or thresholder, so it needs an already-binary image with
//    isolated stray pixels - on a continuous-tone image it has nothing to do.
const speckle = seededRandom(0xd07);
const binary = build(W, H, (x, y) => {
	const shape =
		(x > 8 && x < 26 && y > 8 && y < 26) ||          // solid block
		Math.hypot(x - 44, y - 30) < 10 ||               // solid disc
		y === 40;                                         // 1px line
	// isolated specks, on both the black and the white areas
	const speck = speckle() < 0.06;
	const on = speck ? !shape : shape;
	const v = on ? 255 : 0;
	return [v, v, v];
});

// 8. `photo` with one region altered. The frame-differencing filters need an
//    input that is *mostly* the same as the previous frame - against a wholly
//    different image they just echo it back, which demonstrates nothing.
const moved = build(W, H, (x, y) => {
	const inPatch = x >= 36 && x < 52 && y >= 14 && y < 30;
	if (inPatch) return [235, 225, 60];
	const sky = y < H * 0.55;
	const n = () => 0; // no grain: only the patch should differ
	if (sky) {
		return [90 + x * 0.35 + n(), 140 + y * 0.6 + n(), 215 - y * 0.9 + n()];
	}
	const hill = Math.sin(x * 0.2) * 4;
	return [45 + hill + n(), 105 + y * 0.4 + n(), 40 + n()];
});

// `photo` without its grain, so `moved` differs from it only inside the patch
const clean = build(W, H, (x, y) => {
	const sky = y < H * 0.55;
	if (sky) return [90 + x * 0.35, 140 + y * 0.6, 215 - y * 0.9];
	const hill = Math.sin(x * 0.2) * 4;
	return [45 + hill, 105 + y * 0.4, 40];
});

// 10. Nothing at all. A feedback filter has to be run against darkness for a
//     long stretch before the question "does the trail actually reach black, or
//     does it level off?" can be asked - and on the GPU that question is a real
//     one, because the trail is fed back through an 8-bit frame and rounding to
//     nearest leaves every dim value fixed where it stands.
const black = build(W, H, () => [0, 0, 0]);

// 11. A skin-tone range, for SkinDetector. Its only golden case was `photo`,
//     which contains no skin - the reference image was 3072 black pixels, so the
//     test passed whatever the filter did to skin and went green through a bug
//     that stopped it detecting the darker half of the range entirely.
//
//     Ten columns, one per Monk Skin Tone step, pale on the left to deep on the
//     right. The top five rows darken each column to 45% to stand in for shadow,
//     which is where a chroma threshold gives out first. The bottom four rows are
//     things that must stay black, so the reference shows both halves of the
//     decision rather than only the generous one.
const MST = [
	[246, 237, 228], [243, 231, 219], [247, 234, 208], [234, 218, 186], [215, 189, 150],
	[160, 126, 86], [130, 92, 67], [96, 65, 52], [58, 49, 42], [41, 36, 32]
];
const NOT_SKIN = [
	[0, 0, 0], [128, 128, 128], [255, 255, 255], [90, 140, 210],
	[70, 120, 50], [30, 45, 110], [200, 200, 190], [60, 60, 60],
	[178, 74, 56], [240, 140, 30]
];
const skintones = build(W, H, (x, y) => {
	const column = Math.min(MST.length - 1, Math.floor((x / W) * MST.length));
	const band = Math.floor((y / H) * 9);
	if (band < 5) {
		const exposure = 1 - band * 0.1375;
		return MST[column].map((c) => c * exposure);
	}
	return NOT_SKIN[(column + (band - 5) * 3) % NOT_SKIN.length];
});

const fixtures = { photo, edges, heightmap, alpha, odd, second, binary, clean, moved, black, skintones };

for (const [name, image] of Object.entries(fixtures)) {
	const path = join(out, `${name}.png`);
	writePNG(path, image);
	console.log(`  ${name.padEnd(10)} ${image.width}x${image.height}  ${path}`);
}
console.log(`\n${Object.keys(fixtures).length} fixtures written`);
