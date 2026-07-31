// Covers the from-scratch median-cut quantiser that replaced the GPL
// median-cut.js. See FEATURES.md #7.
import test from 'node:test';
import assert from 'node:assert/strict';

import { medianCut, nearestColourIndex, Posteriser, setImageDataFactory } from '../dist/clarity.js';

class NodeImageData {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Uint8ClampedArray(width * height * 4);
	}
}
setImageDataFactory((w, h) => new NodeImageData(w, h));

/** Builds a buffer from `[r,g,b,repeatCount]` runs. */
function buffer(runs) {
	const total = runs.reduce((n, r) => n + r[3], 0);
	const data = new Uint8ClampedArray(total * 4);
	let i = 0;
	for (const [r, g, b, count] of runs) {
		for (let n = 0; n < count; n++) {
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
			i += 4;
		}
	}
	return data;
}

const key = (c) => `${c[0]},${c[1]},${c[2]}`;

test('returns exactly the requested number of colours', () => {
	const data = buffer([
		[255, 0, 0, 10], [0, 255, 0, 10], [0, 0, 255, 10],
		[255, 255, 0, 10], [0, 255, 255, 10], [255, 0, 255, 10]
	]);
	assert.equal(medianCut(data, { colours: 4 }).length, 4);
	assert.equal(medianCut(data, { colours: 2 }).length, 2);
});

test('never invents more colours than the image contains', () => {
	const data = buffer([[10, 20, 30, 50], [200, 100, 40, 50]]);
	const palette = medianCut(data, { colours: 16 });

	assert.equal(palette.length, 2);
	assert.deepEqual(
		new Set(palette.map(key)),
		new Set(['10,20,30', '200,100,40'])
	);
});

test('separates well-defined clusters', () => {
	// two tight clusters at opposite ends of the space
	const data = buffer([
		[10, 10, 10, 40], [12, 11, 9, 40],
		[240, 240, 240, 40], [238, 242, 241, 40]
	]);
	const palette = medianCut(data, { colours: 2 });

	assert.equal(palette.length, 2);
	const sorted = [...palette].sort((a, b) => a[0] - b[0]);
	assert.ok(sorted[0][0] < 30, 'a dark entry');
	assert.ok(sorted[1][0] > 220, 'a light entry');
});

test('weights the palette towards populous colours', () => {
	// one colour dominates; its cluster should land near it rather than
	// being dragged to the midpoint by the rare outlier
	const data = buffer([[100, 100, 100, 1000], [104, 104, 104, 1]]);
	const [entry] = medianCut(data, { colours: 1 });

	assert.ok(Math.abs(entry[0] - 100) <= 1, `got ${entry[0]}`);
});

test('ignores fully transparent pixels', () => {
	const data = new Uint8ClampedArray(4 * 4);
	// one opaque red pixel, three transparent black ones
	data.set([255, 0, 0, 255], 0);

	const palette = medianCut(data, { colours: 4 });
	assert.equal(palette.length, 1);
	assert.deepEqual(palette[0], [255, 0, 0]);
});

test('handles degenerate input without throwing', () => {
	assert.deepEqual(medianCut(new Uint8ClampedArray(0), { colours: 4 }), []);
	assert.deepEqual(medianCut(buffer([[1, 2, 3, 4]]), { colours: 0 }), []);
	// entirely transparent
	assert.deepEqual(medianCut(new Uint8ClampedArray(40), { colours: 4 }), []);
});

test('is deterministic', () => {
	const data = buffer([
		[13, 200, 7, 9], [240, 3, 88, 21], [4, 4, 250, 3],
		[128, 128, 128, 40], [77, 12, 199, 5]
	]);
	const a = medianCut(data, { colours: 3 });
	const b = medianCut(data, { colours: 3 });
	assert.deepEqual(a, b);
});

test('every palette entry lies inside the image gamut', () => {
	const data = buffer([[20, 30, 40, 5], [60, 70, 80, 5], [100, 110, 120, 5]]);
	for (const c of medianCut(data, { colours: 2 })) {
		assert.ok(c[0] >= 20 && c[0] <= 100, `red ${c[0]} out of range`);
		assert.ok(c[1] >= 30 && c[1] <= 110, `green ${c[1]} out of range`);
		assert.ok(c[2] >= 40 && c[2] <= 120, `blue ${c[2]} out of range`);
	}
});

test('palette entries are whole numbers', () => {
	const data = buffer([[1, 2, 3, 7], [10, 20, 30, 11], [200, 100, 50, 3]]);
	for (const c of medianCut(data, { colours: 2 })) {
		for (const v of c) {
			assert.ok(Number.isInteger(v), `${v} is not an integer`);
			assert.ok(v >= 0 && v <= 255, `${v} out of 0-255`);
		}
	}
});

test('nearestColourIndex picks the closest entry', () => {
	const palette = [
		[0, 0, 0],
		[255, 255, 255],
		[255, 0, 0]
	];
	assert.equal(nearestColourIndex([10, 10, 10], palette), 0);
	assert.equal(nearestColourIndex([240, 250, 240], palette), 1);
	assert.equal(nearestColourIndex([200, 20, 20], palette), 2);
});

test('Posteriser output uses only palette colours', () => {
	const frame = new NodeImageData(16, 16);
	for (let y = 0; y < 16; y++) {
		for (let x = 0; x < 16; x++) {
			const i = (y * 16 + x) * 4;
			frame.data[i] = x * 16;
			frame.data[i + 1] = y * 16;
			frame.data[i + 2] = 128;
			frame.data[i + 3] = 255;
		}
	}

	const filter = new Posteriser({ colours: 6 });
	const out = filter.process(frame);

	assert.ok(filter.palette.length > 0 && filter.palette.length <= 6);
	const allowed = new Set(filter.palette.map(key));

	for (let i = 0; i < out.data.length; i += 4) {
		assert.ok(
			allowed.has(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`),
			`pixel ${i} is not a palette colour`
		);
	}
});

test('Posteriser actually reduces the colour count', () => {
	const frame = new NodeImageData(16, 16);
	for (let i = 0; i < frame.data.length; i += 4) {
		frame.data[i] = (i * 7) % 256;
		frame.data[i + 1] = (i * 13) % 256;
		frame.data[i + 2] = (i * 29) % 256;
		frame.data[i + 3] = 255;
	}

	const before = new Set();
	for (let i = 0; i < frame.data.length; i += 4) {
		before.add(`${frame.data[i]},${frame.data[i + 1]},${frame.data[i + 2]}`);
	}

	const out = new Posteriser({ colours: 4 }).process(frame);
	const after = new Set();
	for (let i = 0; i < out.data.length; i += 4) {
		after.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`);
	}

	assert.ok(before.size > 4, 'test image should start with many colours');
	assert.ok(after.size <= 4, `expected <= 4 colours, got ${after.size}`);
});

test('Posteriser fast method still works', () => {
	const frame = new NodeImageData(8, 8);
	frame.data.fill(120);
	const out = new Posteriser({ method: 'fast', colours: 4 }).process(frame);
	assert.equal(out.data.length, 8 * 8 * 4);
});
