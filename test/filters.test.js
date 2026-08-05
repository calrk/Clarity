// Exercises every filter against the built bundle. This is a migration guard,
// not the full golden-image suite - that's FEATURES.md #6.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as CLARITY from '../dist/clarity.js';
import { filterNames as detectFilters } from './helpers/exports.js';

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

// Which filters need a second frame, asked rather than listed - the same
// lookup the playground uses. A hardcoded set here is how a new dual-input
// filter gets handed one frame and crashes in a test that looks unrelated.
const isDualInput = (name) => (CLARITY.CATALOGUE[name]?.traits ?? []).includes('dual');

// derived from the prototype chain, so exporting a new helper can't be
// mistaken for a filter - see helpers/exports.js
const filterNames = detectFilters();

test('the bundle exports every filter, and the registry agrees', () => {
	// This used to assert a hardcoded count, which meant adding a filter failed
	// a test that said nothing about what was wrong. The invariant it was
	// standing in for is that the three ways to reach a filter - a named export,
	// the FILTERS registry, and the catalogue - list the same set. A filter
	// missing from the registry cannot be built from a chain string; one missing
	// from the exports cannot be imported by name.
	const exported = [...filterNames].sort();
	const registered = Object.keys(CLARITY.FILTERS).sort();
	const catalogued = Object.keys(CLARITY.CATALOGUE).sort();

	assert.deepEqual(registered, exported, 'FILTERS and the named exports disagree');
	assert.deepEqual(catalogued, exported, 'the catalogue and the named exports disagree');
	assert.ok(exported.length > 40, 'sanity: the bundle is not empty');
});

test('importing the library does not require a DOM', () => {
	assert.equal(typeof globalThis.document, 'undefined');
	assert.equal(typeof CLARITY.Blur, 'function');
});

for (const name of filterNames) {
	test(`${name} runs clean over two frames`, () => {
		const filter = new CLARITY[name]({});
		const frame = makeFrame();
		const input = isDualInput(name) ? [frame, makeFrame(90)] : frame;

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
	const once = new CLARITY.Mirror({ horizontal: true }).process(makeFrame());
	assert.ok(sameHistogram(once.data, original.data));

	const twice = new CLARITY.Mirror({ horizontal: true }).process(once);
	assert.deepEqual([...twice.data], [...original.data]);
});

test('Mirror honours horizontal: false', () => {
	const original = makeFrame();
	const out = new CLARITY.Mirror({ horizontal: false }).process(makeFrame());
	assert.deepEqual([...out.data], [...original.data]);
});

test('Wave gathers, leaving no unwritten holes', () => {
	const out = new CLARITY.Wave({ axis: 'vertical', amplitude: 3 }).process(makeFrame());
	assert.ok(sameHistogram(out.data, makeFrame().data));
});

test('Wave has no do-nothing state left to fall into', () => {
	// It used to be two booleans, both defaulting to false, so adding it did
	// nothing until you found the toggles. A select has no fourth state.
	const original = makeFrame();
	for (const axis of CLARITY.Wave.schema.axis.options.map((o) => o.value)) {
		const out = new CLARITY.Wave({ axis, amplitude: 3 }).process(makeFrame());
		assert.notDeepEqual([...out.data], [...original.data], axis + ' did nothing');
	}
});

test('zero-valued options survive the defaults', () => {
	assert.equal(new CLARITY.Blend({ ratio: 0 }).properties.ratio, 0);
	assert.equal(new CLARITY.Blend({}).properties.ratio, 0.5);
	assert.equal(new CLARITY.Translator({ horizontal: 0 }).properties.horizontal, 0);
});

test('Convolver iterations actually compound', () => {
	const one = new CLARITY.Convolver({ preset: 'smooth', iterations: 1 }).process(makeFrame());
	const three = new CLARITY.Convolver({ preset: 'smooth', iterations: 3 }).process(makeFrame());
	assert.notDeepEqual([...one.data], [...three.data]);
});

test('the smooth preset converges instead of inverting fine detail', () => {
	// Smoother, which this replaces, left the centre pixel out of its own
	// average. That gives frequency response (cos 2pi u + cos 2pi v) / 2, which
	// is exactly -1 at the diagonal Nyquist - so a one-pixel checkerboard came
	// back inverted at full strength and iterating flipped it back and forth
	// forever. This is the regression test for the whole reason it went.
	const board = () => {
		const f = new NodeImageData(16, 16);
		for (let y = 0; y < 16; y++) {
			for (let x = 0; x < 16; x++) {
				const i = (y * 16 + x) * 4;
				f.data[i] = f.data[i + 1] = f.data[i + 2] = (x + y) % 2 ? 255 : 0;
				f.data[i + 3] = 255;
			}
		}
		return f;
	};

	// two adjacent pixels, away from the border where the clamp makes the
	// neighbourhood asymmetric. One starts black, the other white.
	const black = (f) => f.data[(8 * 16 + 8) * 4];
	const white = (f) => f.data[(8 * 16 + 9) * 4];
	assert.equal(black(board()), 0, 'the premise: these start opposite');
	assert.equal(white(board()), 255);

	const smooth = (n) =>
		new CLARITY.Convolver({ preset: 'smooth', iterations: n }).process(board());

	// A Gaussian annihilates the checkerboard outright: the two opposite pixels
	// land on the same value in a single pass. Smoother left them at 255 and 0,
	// swapped over.
	const once = smooth(1);
	assert.equal(black(once), white(once), 'the checkerboard should be gone, not inverted');
	assert.ok(Math.abs(black(once) - 128) <= 1, `expected flat grey, got ${black(once)}`);

	// and it stays there under iteration rather than flipping back and forth
	for (const n of [2, 3, 4]) {
		assert.equal(black(smooth(n)), black(once), `pass ${n} moved a settled pixel`);
	}
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

test('grey is exact for neutral pixels', () => {
	// The Rec. 601 weights have to sum to exactly 1, or a neutral grey reads
	// back darker than it went in - which is invisible until a filter with a
	// hard decision boundary lands on it and flips the wrong way.
	const filter = new CLARITY.Filter();
	const pixel = new NodeImageData(1, 1);

	for (let v = 0; v <= 255; v++) {
		pixel.data.set([v, v, v, 255]);
		assert.equal(filter.getColourValue(pixel, 0), v, `grey(${v})`);
	}
});

test('Mask keeps where the mask is light and cuts where it is dark', () => {
	const source = new NodeImageData(3, 1);
	source.data.set([200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255]);
	const mask = new NodeImageData(3, 1);
	// straddling the default threshold of 128, including the boundary itself
	mask.data.set([127, 127, 127, 255, 128, 128, 128, 255, 255, 255, 255, 255]);

	const out = new CLARITY.Mask().process([source, mask]);
	assert.deepEqual([out.data[0], out.data[4], out.data[8]], [0, 200, 200]);

	const flipped = new CLARITY.Mask({ inverted: true }).process([source, mask]);
	assert.deepEqual([flipped.data[0], flipped.data[4], flipped.data[8]], [200, 0, 0]);
});

test('Mask is a hard cut where Multiply attenuates', () => {
	const source = new NodeImageData(1, 1);
	source.data.set([200, 200, 200, 255]);
	const grey = new NodeImageData(1, 1);
	grey.data.set([64, 64, 64, 255]);

	// the reason both filters exist: same inputs, categorically different results
	assert.equal(new CLARITY.Mask().process([source, grey]).data[0], 0);
	assert.equal(new CLARITY.Multiply().process([source, grey]).data[0], 50);
});

test('Tiler wraps seamlessly on an odd-sized frame', () => {
	// 33x25 - neither dimension divides by the 2px step the old scatter used
	const frame = new NodeImageData(33, 25);
	for (let y = 0; y < 25; y++) {
		for (let x = 0; x < 33; x++) {
			const i = (y * 33 + x) * 4;
			frame.data.set([x * 7, y * 9, 128, 255], i);
		}
	}

	const out = new CLARITY.Tiler().process(frame);

	// opposite edges must nearly match - that is the entire point of the filter
	for (let y = 0; y < out.height; y++) {
		const left = out.data[y * out.width * 4];
		const right = out.data[(y * out.width + out.width - 1) * 4];
		assert.ok(Math.abs(left - right) <= 8, `row ${y}: ${left} vs ${right}`);
	}
	// and every pixel must be written, rather than left at the initial zero
	let opaque = 0;
	for (let i = 3; i < out.data.length; i += 4) if (out.data[i] === 255) opaque++;
	assert.equal(opaque, out.width * out.height);
});

test('ridged is the squared complement of billow, from one noise field', () => {
	// Both modes are the same fold of the same octave: billow is |n| and ridged
	// is (1 - |n|) squared. So ridged is recoverable from billow by algebra
	// alone, which pins the fold arithmetic *and* the fact that the two modes
	// share a noise field rather than each generating their own - neither of
	// which a golden image can tell you.
	//
	// One octave, so the normaliser is 1 and the output byte is the octave.
	const shared = { iterations: 1, initialSize: 4 };
	const make = (fold) =>
		new CLARITY.Cloud({ ...shared, fold, random: CLARITY.seededRandom(11) }).process(makeFrame());

	const ridged = make('ridged');
	const billow = make('billow');

	for (let i = 0; i < ridged.data.length; i += 4) {
		const expected = ((255 - billow.data[i]) ** 2) / 255;
		// billow arrives already rounded to a byte, and squaring doubles that
		// error at the dark end, so 2 rather than 1
		assert.ok(
			Math.abs(ridged.data[i] - expected) <= 2,
			`pixel ${i / 4}: billow ${billow.data[i]} implies ridged ${expected.toFixed(1)}, got ${ridged.data[i]}`
		);
	}

	// the squaring is the whole point of the previous assertion, so prove it is
	// actually happening: an unsquared complement would have mean 255 - mean
	const mean = (f) => {
		let sum = 0;
		for (let i = 0; i < f.data.length; i += 4) sum += f.data[i];
		return sum / (f.data.length / 4);
	};
	assert.ok(
		mean(ridged) < 255 - mean(billow) - 5,
		'ridged should sit well below the unsquared complement, or it will wash out'
	);

	// and the unfolded field is neither of them
	assert.notDeepEqual([...make('none').data], [...ridged.data]);
});

/**
 * Filters whose defaults are meant to be neutral.
 *
 * An *adjustment* opens doing nothing on purpose - every image editor shows
 * Levels neutral, and you would be annoyed if adding it moved your picture.
 * An *effect* is the opposite: you added it to see something, and a default
 * that shows nothing reads as a broken filter rather than a starting point.
 *
 * `Wave` was in the wrong group. It had two booleans both defaulting to false,
 * so it sat there doing nothing until you found the toggles - and so did
 * `Rotator` at 0 turns and `ChromaticAberration` at 0 displacement.
 */
const NEUTRAL_BY_DESIGN = new Set(['Levels', 'hsvShifter', 'NormalFlip']);

test('every effect filter does something with its default options', () => {
	const inert = [];

	for (const name of filterNames) {
		if (NEUTRAL_BY_DESIGN.has(name)) continue;

		const filter = new CLARITY[name]({ random: CLARITY.seededRandom(1), now: () => 500 });
		const input = makeFrame();
		let out;

		if (isDualInput(name)) {
			out = filter.process([input, makeFrame(90)]);
		} else if ((CLARITY.CATALOGUE[name].traits ?? []).includes('temporal')) {
			//nothing to compare against on the first frame, by design
			filter.process(makeFrame(90));
			out = filter.process(input);
		} else {
			out = filter.process(input);
		}

		if (out.width !== input.width || out.height !== input.height) continue;
		if (![...out.data].some((v, i) => v !== input.data[i])) inert.push(name);
	}

	assert.deepEqual(inert, [], 'these do nothing until an option is changed');
});

test('the neutral filters really are neutral, and really do work', () => {
	// the other half: if one of these stopped being an identity at its
	// defaults, it would have been quietly moved out of the exempt group
	const original = makeFrame();
	for (const name of NEUTRAL_BY_DESIGN) {
		assert.deepEqual(
			[...new CLARITY[name]({}).process(makeFrame()).data],
			[...original.data],
			`${name} is exempt from the test above, so it must be an identity`
		);
	}

	// and each is exempt for being an adjustment, not for being broken
	assert.notDeepEqual([...new CLARITY.Levels({ black: 40 }).process(makeFrame()).data], [...original.data]);
	assert.notDeepEqual([...new CLARITY.hsvShifter({ hue: 90 }).process(makeFrame()).data], [...original.data]);
	assert.notDeepEqual([...new CLARITY.NormalFlip({ green: true }).process(makeFrame()).data], [...original.data]);
});

test('a ScreenBurn ghost fades out rather than popping out', () => {
	// The trail is the age-weighted maximum over a ring of retained frames. A
	// purely geometric weight is still non-zero at the oldest one - so a frame's
	// contribution did not fade away, it stopped, and the tail of the trail
	// visibly blinked out one frame at a time.
	//
	// Asserted without magic numbers: feed one white frame and then black ones,
	// and require that the step where the ghost leaves the ring is no bigger
	// than the largest step before it. A pop *is* that final step being the
	// largest, so this is the defect stated directly.
	const solid = (value) => {
		const frame = new NodeImageData(4, 4);
		frame.data.fill(value);
		for (let i = 3; i < frame.data.length; i += 4) frame.data[i] = 255;
		return frame;
	};
	const brightest = (frame) => {
		let peak = 0;
		for (let i = 0; i < frame.data.length; i += 4) peak = Math.max(peak, frame.data[i]);
		return peak;
	};

	const length = 6;
	const burn = new CLARITY.ScreenBurn({ length });
	burn.process(solid(255));

	// Exactly `length` steps: the white frame is pushed out of the ring on the
	// last one, so the final reading is the moment it leaves. Running even one
	// step further appends a 0 -> 0 step and hides the pop behind it.
	const trail = [];
	for (let step = 0; step < length; step++) trail.push(brightest(burn.process(solid(0))));

	assert.ok(trail[0] > 0, 'a white frame should leave something behind at all');
	assert.equal(trail.at(-1), 0, 'the ghost should be gone once it leaves the ring');

	const drops = trail.slice(1).map((value, i) => trail[i] - value);
	const final = drops.at(-1);
	assert.ok(
		final <= Math.max(...drops.slice(0, -1)),
		`the ghost popped: it lost ${final} on the last step, against ${drops.slice(0, -1).join(', ')} before`
	);
});
