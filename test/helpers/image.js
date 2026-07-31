// PNG load/save and image comparison for the golden-image suite.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/** Node has no global ImageData, so Clarity gets handed this via setImageDataFactory. */
export class NodeImageData {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Uint8ClampedArray(width * height * 4);
	}
}

export function readPNG(path) {
	const png = PNG.sync.read(readFileSync(path));
	const image = new NodeImageData(png.width, png.height);
	image.data.set(png.data);
	return image;
}

export function writePNG(path, image) {
	mkdirSync(dirname(path), { recursive: true });
	const png = new PNG({ width: image.width, height: image.height });
	png.data.set(image.data);
	writeFileSync(path, PNG.sync.write(png));
}

export function exists(path) {
	return existsSync(path);
}

/**
 * Compares two images.
 *
 * `mode` decides what "close enough" means, because one metric doesn't fit
 * every filter:
 *
 *  - `'tolerance'` — every channel must be within `tolerance` of the reference.
 *    Right for pointwise and accumulating filters, where small rounding
 *    differences are expected and evenly spread.
 *
 *  - `'population'` — pixels may differ arbitrarily, but no more than
 *    `maxDifferentRatio` of them may differ at all. Right for thresholders and
 *    other filters with a hard decision boundary, where a one-unit difference
 *    in the input flips an output pixel between 0 and 255. A per-channel
 *    tolerance would either fail a correct implementation or hide a broken one.
 *
 * Returns `{ pass, differing, total, maxDelta, diff }`, where `diff` is a
 * visual diff image when the comparison fails.
 */
export function compare(actual, expected, options = {}) {
	const { mode = 'tolerance', tolerance = 1, maxDifferentRatio = 0 } = options;

	if (actual.width !== expected.width || actual.height !== expected.height) {
		return {
			pass: false,
			reason: `size mismatch: ${actual.width}x${actual.height} vs ${expected.width}x${expected.height}`,
			differing: actual.width * actual.height,
			total: expected.width * expected.height,
			maxDelta: 255,
			diff: null
		};
	}

	const total = expected.width * expected.height;
	let differing = 0;
	let maxDelta = 0;

	for (let i = 0; i < expected.data.length; i += 4) {
		let pixelDelta = 0;
		for (let c = 0; c < 4; c++) {
			const delta = Math.abs(actual.data[i + c] - expected.data[i + c]);
			if (delta > pixelDelta) pixelDelta = delta;
		}
		if (pixelDelta > maxDelta) maxDelta = pixelDelta;
		if (pixelDelta > (mode === 'tolerance' ? tolerance : 0)) differing++;
	}

	const pass =
		mode === 'tolerance'
			? differing === 0
			: differing / total <= maxDifferentRatio;

	let diff = null;
	if (!pass) {
		const diffPNG = new PNG({ width: expected.width, height: expected.height });
		pixelmatch(
			Buffer.from(actual.data.buffer, actual.data.byteOffset, actual.data.length),
			Buffer.from(expected.data.buffer, expected.data.byteOffset, expected.data.length),
			diffPNG.data,
			expected.width,
			expected.height,
			{ threshold: 0 }
		);
		diff = new NodeImageData(expected.width, expected.height);
		diff.data.set(diffPNG.data);
	}

	return { pass, differing, total, maxDelta, diff };
}

/** Human-readable summary for an assertion message. */
export function describeResult(result, options = {}) {
	const { mode = 'tolerance', tolerance = 1, maxDifferentRatio = 0 } = options;

	if (result.reason) {
		return result.reason;
	}

	const percent = ((result.differing / result.total) * 100).toFixed(2);

	return mode === 'tolerance'
		? `${result.differing}/${result.total} pixels (${percent}%) exceed tolerance ${tolerance}; largest channel delta ${result.maxDelta}`
		: `${result.differing}/${result.total} pixels (${percent}%) differ, budget ${(maxDifferentRatio * 100).toFixed(2)}%; largest channel delta ${result.maxDelta}`;
}
