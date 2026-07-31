// Exercises every filter against the built bundle. This is a migration guard,
// not the full golden-image suite - that's FEATURES.md #6.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as CLARITY from '../dist/clarity.js';

// Node has no global ImageData, so hand Clarity a factory for headless use.
class NodeImageData {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Uint8ClampedArray(width * height * 4);
	}
}
CLARITY.setImageDataFactory((w, h) => new NodeImageData(w, h));

const W = 32;
const H = 24;

/** Non-square gradient with hard edges and a flat block. */
function makeFrame(seed = 0) {
	const f = new NodeImageData(W, H);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 4;
			f.data[i] = (x * 8 + seed) % 256;
			f.data[i + 1] = (y * 10) % 256;
			f.data[i + 2] = x < W / 2 ? 20 : 200;
			f.data[i + 3] = 255;
		}
	}
	for (let y = 2; y < 8; y++) {
		for (let x = 2; x < 8; x++) {
			const i = (y * W + x) * 4;
			f.data[i] = f.data[i + 1] = f.data[i + 2] = 77;
			f.data[i + 3] = 255;
		}
	}
	return f;
}

function histogram(d) {
	const h = new Map();
	for (let i = 0; i < d.length; i += 4) {
		const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
		h.set(k, (h.get(k) ?? 0) + 1);
	}
	return h;
}

function sameHistogram(a, b) {
	const ha = histogram(a);
	const hb = histogram(b);
	if (ha.size !== hb.size) return false;
	for (const [k, v] of ha) if (hb.get(k) !== v) return false;
	return true;
}

const DUAL_INPUT = new Set(['AddSub', 'Blend', 'Mask', 'Multiply']);
const NOT_FILTERS = new Set([
	'Filter', 'Interface', 'Operations', 'Pixel',
	'createImageData', 'cloneImageData', 'fillAlpha', 'setImageDataFactory',
	'controlValue', 'medianCut', 'nearestColourIndex'
]);

const filterNames = Object.keys(CLARITY).filter(
	(n) => !NOT_FILTERS.has(n) && typeof CLARITY[n] === 'function'
);

test('the bundle exports every filter', () => {
	assert.equal(filterNames.length, 41);
});

test('importing the library does not require a DOM', () => {
	assert.equal(typeof globalThis.document, 'undefined');
	assert.equal(typeof CLARITY.Blur, 'function');
});

for (const name of filterNames) {
	test(`${name} runs clean over two frames`, () => {
		const filter = new CLARITY[name]({});
		const frame = makeFrame();
		const input = DUAL_INPUT.has(name) ? [frame, makeFrame(90)] : frame;

		// twice, so stateful filters get a second pass
		filter.process(input);
		const out = filter.process(input);

		assert.ok(out?.data, 'returned usable ImageData');
		assert.equal(out.data.length, W * H * 4, 'output is frame-sized');

		for (let i = 0; i < out.data.length; i += 4) {
			assert.ok(!Number.isNaN(out.data[i]), `NaN at ${i}`);
		}

		// Cloud derives alpha from its colour options, so it is legitimately
		// transparent with the defaults - see FEATURES.md #1.
		if (name !== 'Cloud') {
			for (let i = 3; i < out.data.length; i += 4) {
				assert.equal(out.data[i], 255, `alpha not opaque at ${i}`);
			}
		}
	});
}

test('Operations.colorDistance mirrors colourDistance', () => {
	const a = [0, 0, 0];
	const b = [10, 20, 30];
	assert.equal(
		CLARITY.Operations.colorDistance(a, b),
		CLARITY.Operations.colourDistance(a, b)
	);
});

test('Pixel round-trips RGB through HSV in 0-255', () => {
	const p = new CLARITY.Pixel(200, 100, 50);
	assert.ok(Math.abs(p.v - 200 / 255) < 1e-9);

	p.setFromHSV(0, 0, 0.5);
	assert.ok(Math.abs(p.r - 127.5) < 1e-9, 'grey is written in 0-255');
});

test('Mirror preserves every pixel and is its own inverse', () => {
	const original = makeFrame();
	const once = new CLARITY.Mirror({ Horizontal: true }).process(makeFrame());
	assert.ok(sameHistogram(once.data, original.data));

	const twice = new CLARITY.Mirror({ Horizontal: true }).process(once);
	assert.deepEqual([...twice.data], [...original.data]);
});

test('Mirror honours Horizontal: false', () => {
	const original = makeFrame();
	const out = new CLARITY.Mirror({ Horizontal: false }).process(makeFrame());
	assert.deepEqual([...out.data], [...original.data]);
});

test('Wave gathers, leaving no unwritten holes', () => {
	const out = new CLARITY.Wave({ vertical: true, amplitude: 3 }).process(makeFrame());
	assert.ok(sameHistogram(out.data, makeFrame().data));
});

test('Wave with no axis enabled passes the frame through', () => {
	const original = makeFrame();
	const out = new CLARITY.Wave({}).process(makeFrame());
	assert.deepEqual([...out.data], [...original.data]);
});

test('zero-valued options survive the defaults', () => {
	assert.equal(new CLARITY.Blend({ ratio: 0 }).properties.ratio, 0);
	assert.equal(new CLARITY.Blend({}).properties.ratio, 0.5);
	assert.equal(new CLARITY.Translator({ horizontal: 0 }).properties.horizontal, 0);
});

test('Smoother iterations actually compound', () => {
	const one = new CLARITY.Smoother({ iterations: 1 }).process(makeFrame());
	const three = new CLARITY.Smoother({ iterations: 3 }).process(makeFrame());
	assert.notDeepEqual([...one.data], [...three.data]);
});

test('Posteriser only ever emits real palette entries', () => {
	const filter = new CLARITY.Posteriser({ colours: 4 });
	const out = filter.process(makeFrame());
	const palette = new Set(filter.palette.map((c) => `${c[0]},${c[1]},${c[2]}`));

	for (let i = 0; i < out.data.length; i += 4) {
		assert.ok(
			palette.has(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`),
			`pixel ${i} is not a palette colour`
		);
	}
});

test('DifferenceDetector reports nothing against an identical frame', () => {
	const filter = new CLARITY.DifferenceDetector({});
	filter.process(makeFrame());
	const out = filter.process(makeFrame());

	for (let i = 0; i < out.data.length; i += 4) {
		assert.equal(out.data[i], 0);
	}
});

test('Puzzler permutes on a non-square segment grid', () => {
	const out = new CLARITY.Puzzler({ horizontalSegs: 4, verticalSegs: 2 }).process(makeFrame());
	assert.ok(sameHistogram(out.data, makeFrame().data));
});

test('Puzzler numToPos returns [column, row]', () => {
	const p = new CLARITY.Puzzler({ horizontalSegs: 4, verticalSegs: 2 });
	assert.deepEqual(p.numToPos(6), [2, 1]);
});
