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

		// No exemptions by name. Cloud used to be one, because it derived alpha
		// from its colour options and so was legitimately transparent with the
		// defaults - see FEATURES.md #1. Those options are gone and it is opaque
		// like everything else, which is the whole of what that exemption was
		// hiding.
		//
		// ChromaKey is legitimately transparent, so the rule keys off the
		// declared `alpha-out` trait rather than off its name - and it runs in
		// both directions, because a trait nothing checks is a comment. A filter
		// that claims alpha has to produce some, and one that does not claim it
		// has to be opaque everywhere.
		const claimsAlpha = (CLARITY.CATALOGUE[name].traits ?? []).includes('alpha-out');
		let transparent = 0;
		for (let i = 3; i < out.data.length; i += 4) {
			if (out.data[i] !== 255) transparent++;
			if (!claimsAlpha) {
				assert.equal(out.data[i], 255, `alpha not opaque at ${i}`);
			}
		}
		if (claimsAlpha) {
			assert.ok(transparent > 0, 'declares alpha-out but returned a fully opaque frame');
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

const solidFrame = (value) => {
	const frame = new NodeImageData(4, 4);
	frame.data.fill(value);
	for (let i = 3; i < frame.data.length; i += 4) frame.data[i] = 255;
	return frame;
};
const brightestOf = (frame) => {
	let peak = 0;
	for (let i = 0; i < frame.data.length; i += 4) peak = Math.max(peak, frame.data[i]);
	return peak;
};

/** One white frame, then black ones, until the trail is gone or `limit` runs out. */
function burnTrail(filter, limit = 4000) {
	filter.process(solidFrame(255));

	const trail = [];
	for (let step = 0; step < limit; step++) {
		const peak = brightestOf(filter.process(solidFrame(0)));
		trail.push(peak);
		if (peak === 0) break;
	}
	return trail;
}

test('a ScreenBurn ghost fades all the way out, one step at a time', () => {
	// This used to be a ring of frames blended by age, and a ring has an edge to
	// fall off: the oldest frame's weight was not zero, so its contribution did
	// not fade away, it stopped, and the tail blinked out one frame at a time.
	// Accumulating geometrically has no edge - but it does have a trap, which is
	// what this really guards.
	const trail = burnTrail(new CLARITY.ScreenBurn({ decay: 0.9 }));

	assert.ok(trail.length > 4, `the ghost should outlive a few frames, got ${trail.join(', ')}`);
	assert.equal(trail.at(-1), 0, 'the ghost must reach black rather than levelling off');

	for (let i = 1; i < trail.length; i++) {
		assert.ok(trail[i] < trail[i - 1], `the trail went ${trail[i - 1]} -> ${trail[i]}, so it stalled`);
	}
});

test('a slow ScreenBurn still reaches black, however slow', () => {
	// The trap. The trail is fed back through an 8-bit frame, and rounding a
	// float colour to the nearest step means `round(v * 0.98) == v` for every v
	// up to 25 - so with anything but a floor, every dim pixel freezes at its
	// value and stays there for good. It would read as permanent grime rather
	// than as a long fade, and only at the slow end of the slider.
	//
	// The slowest setting the schema allows, so nothing in range can stall.
	const slowest = CLARITY.ScreenBurn.schema.decay.max;
	const trail = burnTrail(new CLARITY.ScreenBurn({ decay: slowest }));

	assert.equal(trail.at(-1), 0, `decay=${slowest} never reached black in ${trail.length} frames`);
	assert.ok(trail.length > 100, `decay=${slowest} should be a long fade, gone in ${trail.length}`);
});

test('GradientMap bands the ramp into exactly the number of steps asked for', () => {
	// `steps` is what makes `cycle` read as flowing bands rather than as a wash,
	// so "how many distinct colours came out" is the property, not the look.
	const distinct = (frame) => {
		const seen = new Set();
		for (let i = 0; i < frame.data.length; i += 4) {
			seen.add(`${frame.data[i]},${frame.data[i + 1]},${frame.data[i + 2]}`);
		}
		return seen.size;
	};

	const source = makeFrame();
	const smooth = distinct(new CLARITY.GradientMap({}).process(source));
	const banded = distinct(new CLARITY.GradientMap({ steps: 5 }).process(source));

	assert.ok(banded <= 5, `steps=5 should give at most 5 colours, got ${banded}`);
	assert.ok(smooth > banded, `smooth should be richer than banded, got ${smooth} vs ${banded}`);
});

test('GradientMap cycling moves the colours and leaves the bands alone', () => {
	// Palette cycling is the *colours* moving through fixed bands. Rotating
	// before banding instead would slide the band edges, and the picture would
	// appear to crawl rather than to flow - so both halves are asserted.
	const source = makeFrame();
	const at = (ms) =>
		new CLARITY.GradientMap({ ramp: 'spectrum', steps: 6, cycle: 1, now: () => ms }).process(source);

	const first = at(0);
	const later = at(400);

	assert.notDeepEqual([...later.data], [...first.data], 'cycling did not change anything');

	// Same pixels grouped together in both, because banding happens first: two
	// pixels sharing a colour before the rotation must still share one after.
	const groups = new Map();
	for (let i = 0; i < first.data.length; i += 4) {
		const was = `${first.data[i]},${first.data[i + 1]},${first.data[i + 2]}`;
		const now = `${later.data[i]},${later.data[i + 1]},${later.data[i + 2]}`;
		const already = groups.get(was);
		if (already === undefined) groups.set(was, now);
		else assert.equal(now, already, `band ${was} split into ${now} and ${already}`);
	}

	// and a still cycle really is still
	assert.deepEqual(
		[...new CLARITY.GradientMap({ now: () => 9999 }).process(source).data],
		[...new CLARITY.GradientMap({ now: () => 0 }).process(source).data],
		'cycle defaults to 0, so the clock should not matter'
	);
});

test('a random filter draws the same thing every time it runs', () => {
	// It used to draw a fresh seed inside `doProcess`, so one Cloud produced a
	// different cloud on every call. Invisible while a still image rendered once
	// and stopped; a strobe the moment anything drove a loop.
	for (const name of ['Cloud', 'Voronoi', 'Noise']) {
		const filter = new CLARITY[name]({});
		const first = [...filter.process(makeFrame()).data];
		const again = [...filter.process(makeFrame()).data];
		assert.deepEqual(again, first, `${name} redrew itself on the second run`);
		assert.equal(CLARITY[name].pure, true, `${name} should be cacheable now`);
	}
});

test('two instances of a random filter still differ, and a set seed pins them', () => {
	// The Photoshop trick this has to keep: Cloud/Difference/Cloud folds an
	// already-folded field, which only works if the two Clouds are different.
	const a = [...new CLARITY.Cloud({}).process(makeFrame()).data];
	const b = [...new CLARITY.Cloud({}).process(makeFrame()).data];
	assert.notDeepEqual(b, a, 'two separate Clouds came out identical');

	// and the other half: naming a seed makes it reproducible, which is what
	// lets a chain in a URL open on the same picture for everyone
	assert.deepEqual(
		[...new CLARITY.Cloud({ seed: 4242 }).process(makeFrame()).data],
		[...new CLARITY.Cloud({ seed: 4242 }).process(makeFrame()).data]
	);
});

test('a cloud under an animating wave holds still', () => {
	// The question this whole change came from. Wave is impure, so the pipeline
	// re-runs it every frame - and it used to drag the Cloud above it along,
	// because an impure stage cannot be cached either. With the clock frozen the
	// wave is fixed, so the only thing that could move is the cloud.
	let clock = 0;
	const chain = new CLARITY.Pipeline([
		new CLARITY.Cloud({ iterations: 3 }),
		new CLARITY.Wave({ now: () => clock, amplitude: 6 })
	]);

	const blank = new NodeImageData(W, H);
	const first = [...chain.run(blank).data];
	for (let i = 0; i < 4; i++) chain.run(blank);
	assert.deepEqual([...chain.run(blank).data], first, 'something underneath the wave moved');

	// and the control: let the clock run and the wave really does move
	clock = 500;
	assert.notDeepEqual([...chain.run(blank).data], first);
});

test('animated is a question about time, not about caching', () => {
	// `pure` says "may I reuse the last output" and `animated` says "will waiting
	// produce a new one". A Wave parked at speed 0 answers no to both, and the
	// playground loops on the second - it used to loop on the first and spin
	// forever redrawing an identical frame.
	const still = [
		new CLARITY.Wave({ speed: 0 }),
		new CLARITY.DotCrawl({ speed: 0 }),
		new CLARITY.GradientMap({ cycle: 0 })
	];
	for (const filter of still) {
		const type = filter.constructor;
		assert.equal(type.animated(filter), false, `${type.name} claims to be animating`);
		assert.equal(type.pure, false, `${type.name} is still impure, and should be`);
	}

	const moving = [
		new CLARITY.Wave({ speed: 2 }),
		new CLARITY.DotCrawl({ speed: 4 }),
		new CLARITY.GradientMap({ cycle: 0.5 })
	];
	for (const filter of moving) {
		assert.equal(filter.constructor.animated(filter), true, `${filter.constructor.name} should animate`);
	}

	// the three that were reseeding are not animating at all any more
	for (const name of ['Cloud', 'Voronoi', 'Noise']) {
		const filter = new CLARITY[name]({});
		assert.equal(CLARITY[name].animated(filter), false, `${name} should not drive a loop`);
	}
});

test('cycling a ramp never jumps, whether or not the ramp closes', () => {
	// `fire` runs black to white, so rotating it straight through slammed white
	// into black once per cycle - a visible tear rather than a fade. A ramp that
	// does not end where it started is swept up and back down instead. Asserted
	// as continuity, which is what "no seam" actually means.
	const colourAt = (ramp, ms) => {
		const out = new CLARITY.GradientMap({ ramp, cycle: 1, now: () => ms }).process(makeFrame());
		//one fixed pixel: what matters is how its colour moves as the phase does
		return [out.data[0], out.data[1], out.data[2]];
	};

	for (const ramp of CLARITY.GradientMap.schema.ramp.options.map((o) => o.value)) {
		let worst = 0;
		let previous = colourAt(ramp, 0);
		//two full cycles at 1/s, so a fold is crossed in both directions
		for (let ms = 10; ms <= 2000; ms += 10) {
			const now = colourAt(ramp, ms);
			worst = Math.max(worst, ...now.map((v, i) => Math.abs(v - previous[i])));
			previous = now;
		}
		assert.ok(worst < 25, `${ramp} jumped by ${worst} between adjacent frames`);
	}
});

test('the fold leaves a ramp that is not cycling exactly as it was', () => {
	// the fold is the identity on 0-1, which is why adding it moved no goldens
	const source = makeFrame();
	for (const ramp of CLARITY.GradientMap.schema.ramp.options.map((o) => o.value)) {
		assert.deepEqual(
			[...new CLARITY.GradientMap({ ramp, now: () => 5000 }).process(source).data],
			[...new CLARITY.GradientMap({ ramp, now: () => 0 }).process(source).data],
			`${ramp} moved without being asked to cycle`
		);
	}
});

test('Translator loses no pixels, however far it has scrolled', () => {
	// A wrapping translate is a permutation: every pixel goes somewhere and
	// nothing lands twice. The old wrap adjusted the index once, which was only
	// ever enough because the offset was clamped to a single frame - scrolling
	// carries it past that, and one adjustment then leaves the index off the end
	// of the row, reading a neighbouring line or falling outside the frame.
	// The offset reaches `horizontal + almost one frame` of travel, so a large
	// offset puts the destination index more than two frames past the source and
	// needs two subtractions, not one. A gentle offset never gets there, which is
	// why this sweeps the extremes rather than picking comfortable numbers.
	const original = makeFrame();
	for (const horizontal of [0.35, 0.9, 1, -0.9]) {
		for (const ms of [0, 900, 4300, 7700, 61000]) {
			const out = new CLARITY.Translator({
				horizontal,
				vertical: -horizontal,
				speed: 3,
				now: () => ms
			}).process(makeFrame());

			assert.ok(
				sameHistogram(out.data, original.data),
				`horizontal=${horizontal} at ${ms}ms did not preserve the pixels`
			);
		}
	}
});

test('Translator only moves when it is told to', () => {
	const still = new CLARITY.Translator({ horizontal: 0.25, now: () => 0 }).process(makeFrame());
	const later = new CLARITY.Translator({ horizontal: 0.25, now: () => 8000 }).process(makeFrame());
	assert.deepEqual([...later.data], [...still.data], 'it drifted at speed 0');

	// 5s rather than 8s: at a quarter of a frame per second, eight seconds is
	// exactly two whole frames of travel, and a wrapping scroll that has gone
	// round twice is back where it started - a true result that would read here
	// as the filter having failed to move.
	const scrolling = new CLARITY.Translator({ horizontal: 0.25, speed: 1, now: () => 5000 }).process(makeFrame());
	assert.notDeepEqual([...scrolling.data], [...still.data]);

	assert.equal(CLARITY.Translator.animated(new CLARITY.Translator({})), false);
	assert.equal(CLARITY.Translator.animated(new CLARITY.Translator({ speed: 0.5 })), true);
});

/** A flat square frame, or one shaded by a function of (x, y). */
function flat(value, size = 64) {
	const f = new NodeImageData(size, size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const v = typeof value === 'function' ? value(x, y) : value;
			const i = (y * size + x) * 4;
			f.data[i] = f.data[i + 1] = f.data[i + 2] = v;
			f.data[i + 3] = 255;
		}
	}
	return f;
}

const meanChannel = (img) => {
	let sum = 0;
	for (let i = 0; i < img.data.length; i += 4) sum += img.data[i];
	return sum / (img.data.length / 4);
};

test('Halftone reproduces tone by dot area, not dot width', () => {
	// The radius goes as sqrt(coverage) because perceived tone follows the dot's
	// *area*. A circle of radius r in a cell of side s covers pi*r^2 / s^2, so at
	// scale 1 a cell asking for coverage c inks pi/4 * c of itself, and black ink
	// on white paper should average 255 * (1 - pi/4 * c).
	//
	// Drop the sqrt and the radius becomes linear in coverage, which squares the
	// inked fraction: a midtone would ink 0.196 of each cell instead of 0.393 and
	// come back at 205 rather than 155. This is the whole of correct tonal
	// reproduction in a halftone and it is invisible in any single picture.
	for (const grey of [64, 128, 191]) {
		const out = new CLARITY.Halftone({ spacing: 8, scale: 1, colour: 'ink' })
			.process(flat(grey));

		const coverage = (255 - grey) / 255;
		const predicted = 255 * (1 - (Math.PI / 4) * coverage);

		assert.ok(
			Math.abs(meanChannel(out) - predicted) < 6,
			`grey ${grey}: expected about ${predicted.toFixed(1)}, got ${meanChannel(out).toFixed(1)}`
		);
	}
});

test('Halftone dots grow past their own cell', () => {
	// Each pixel tests the nine cells around it rather than only the one it falls
	// in. For a uniform grid that changes nothing - a pixel's own cell centre is
	// always the nearest one - so it only shows where neighbouring radii differ
	// sharply, which is exactly a contrast edge.
	//
	// Dark on the left, white on the right. The dark cells want a full dot, and
	// past a scale of 1 that dot is wider than its cell, so it has to reach into
	// the light side. Testing one cell clips it to a square at the boundary and
	// the reach is zero at every scale.
	for (const [scale, expected] of [[1, 0], [1.5, 2], [2, 4]]) {
		const out = new CLARITY.Halftone({ spacing: 8, angle: 0, scale, colour: 'ink' })
			.process(flat((x) => (x < 32 ? 0 : 255)));

		let reach = 0;
		for (let y = 0; y < 64; y++) {
			for (let x = 32; x < 64; x++) {
				if (out.data[(y * 64 + x) * 4] < 128) reach = Math.max(reach, x - 31);
			}
		}

		// radius is scale * spacing/2, so it clears the half-cell by exactly this
		assert.equal(reach, expected, `at scale ${scale} the dots reached ${reach}px past the edge`);
	}
});

test('Halftone leaves a blown-out area completely clean', () => {
	// A zero-radius dot still sits exactly on its cell centre, so the one-pixel
	// antialiasing reports half coverage for that pixel unless something fades
	// sub-pixel dots out - and a white sky comes back stippled with grey.
	const out = new CLARITY.Halftone({ spacing: 8, colour: 'ink' }).process(flat(255));

	for (let i = 0; i < out.data.length; i += 4) {
		assert.equal(out.data[i], 255, `stippled a pure white frame at ${i}`);
	}
});

test('Fill takes three spellings of a colour and keeps one', () => {
	// The argument for one Fill rather than a filter per colour model is that the
	// model is a property of how you *type* the colour, not of the filter - so all
	// three spellings must collapse to the same property and the same pixels.
	// `#F84` is shorthand for `ff8844`, and expanding it on the way in is what
	// keeps two spellings of one colour from being two property values.
	const hex = new CLARITY.Fill({ colour: 'ff8844' });
	const hash = new CLARITY.Fill({ colour: '#FF8844' });
	const short = new CLARITY.Fill({ colour: '#F84' });
	const rgb = new CLARITY.Fill({ rgb: [255, 136, 68] });

	for (const [name, filter] of [['hash', hash], ['shorthand', short], ['rgb', rgb]]) {
		assert.equal(filter.properties.colour, 'ff8844', `${name} did not normalise`);
		assert.deepEqual(
			[...filter.process(makeFrame()).data],
			[...hex.process(makeFrame()).data],
			`${name} produced different pixels from the hex spelling`
		);
	}

	// HSV goes through a conversion, so it is checked as a colour rather than by
	// string equality: pure red is hue 0, full saturation, full value.
	const hsv = new CLARITY.Fill({ hsv: [0, 1, 1] });
	assert.equal(hsv.properties.colour, 'ff0000');

	// Two spellings at once is a caller bug, not user input, so it throws - the
	// same split setProperty makes between a bad key and a bad value.
	assert.throws(() => new CLARITY.Fill({ colour: 'ff0000', rgb: [0, 0, 255] }), /one of colour, color, rgb or hsv/);
	// including the two spellings of the same word, which are the likeliest pair
	// to arrive together and the least likely to have been meant
	assert.throws(() => new CLARITY.Fill({ colour: 'ff0000', color: '0000ff' }), /got colour and color/);
	assert.equal(new CLARITY.Fill({ color: '#F84' }).properties.colour, 'ff8844', 'the American spelling did not normalise');

	// A malformed string is not a caller bug in the same way - it may have come
	// from a hand-edited link - so it falls back rather than throwing.
	assert.equal(new CLARITY.Fill({ colour: 'nonsense' }).properties.colour, '000000');
});

test('Halftone CMYK reproduces a colour it can print exactly', () => {
	// Four screens mixing subtractively should land back on the colour they came
	// from wherever the dots reach full coverage. Checked at the primaries and at
	// the two ends, because those are the places the maths can be wrong in a way
	// that a photograph hides: pure red is magenta plus yellow with no cyan and
	// no black, and if the grey-component replacement is wrong it prints muddy.
	const flatFrame = (r, g, b) => {
		const f = new NodeImageData(48, 48);
		for (let i = 0; i < f.data.length; i += 4) {
			f.data[i] = r; f.data[i + 1] = g; f.data[i + 2] = b; f.data[i + 3] = 255;
		}
		return f;
	};

	// scale 1.5 so a full-coverage dot reaches its cell's corners; below sqrt(2)
	// the paper still shows through and nothing can print solid.
	const at = (r, g, b) => {
		const out = new CLARITY.Halftone({ spacing: 6, scale: 1.5, colour: 'cmyk' })
			.process(flatFrame(r, g, b));
		const i = (24 * 48 + 24) * 4;
		return [out.data[i], out.data[i + 1], out.data[i + 2]];
	};

	for (const [name, colour] of [
		['white', [255, 255, 255]],
		['black', [0, 0, 0]],
		['red', [255, 0, 0]],
		['green', [0, 255, 0]],
		['blue', [0, 0, 255]]
	]) {
		const got = at(...colour);
		for (let k = 0; k < 3; k++) {
			assert.ok(
				Math.abs(got[k] - colour[k]) <= 2,
				`${name}: printed [${got}] for [${colour}]`
			);
		}
	}
});

test('Halftone CMYK pulls the black out rather than stacking three inks', () => {
	// Grey-component replacement is the whole difference between print and mud.
	// A neutral grey has equal C, M and Y, so all of it should become K and none
	// of it should print as colour - which shows up as the result staying neutral.
	// Without the K it would be three overlapping coloured dots and come back
	// with a cast.
	const grey = new NodeImageData(48, 48);
	for (let i = 0; i < grey.data.length; i += 4) {
		grey.data[i] = grey.data[i + 1] = grey.data[i + 2] = 128;
		grey.data[i + 3] = 255;
	}

	const out = new CLARITY.Halftone({ spacing: 6, scale: 1.5, colour: 'cmyk' }).process(grey);

	let worstCast = 0;
	for (let i = 0; i < out.data.length; i += 4) {
		const [r, g, b] = [out.data[i], out.data[i + 1], out.data[i + 2]];
		worstCast = Math.max(worstCast, Math.max(r, g, b) - Math.min(r, g, b));
	}
	assert.equal(worstCast, 0, `neutral grey printed with a colour cast of ${worstCast}`);
});

test('Woodgrain stretch draws the grain out along the board', () => {
	// The anisotropy is the thing that separates a plank from a stump, and it is
	// easy to half-implement: stretching the rings but not the noise that
	// perturbs them leaves the wobble round, and the result reads as fabric.
	// Measuring how much rougher the field is across the grain than along it
	// catches either half going missing.
	const S = 96;
	const blank = () => new NodeImageData(S, S);

	const roughness = (img, dx, dy) => {
		let sum = 0;
		let n = 0;
		for (let y = 0; y + dy < S; y++) {
			for (let x = 0; x + dx < S; x++) {
				sum += Math.abs(img.data[(y * S + x) * 4] - img.data[((y + dy) * S + (x + dx)) * 4]);
				n++;
			}
		}
		return sum / n;
	};

	const ratioAt = (stretch) => {
		const img = new CLARITY.Woodgrain({ seed: 11, stretch }).process(blank());
		return roughness(img, 0, 1) / roughness(img, 1, 0);
	};

	// At a stretch of 1 the squashed distance is a plain circle, so the field is
	// isotropic - concentric rings, which is end grain.
	const stump = ratioAt(1);
	assert.ok(stump < 1.3, `stretch 1 should be near-isotropic, got a ratio of ${stump.toFixed(2)}`);

	// Wound up, the rings flatten into long shallow arcs and the field gets very
	// much smoother along the board than across it.
	const plank = ratioAt(20);
	assert.ok(plank > 10, `stretch 20 should be strongly anisotropic, got ${plank.toFixed(2)}`);

	// and monotonically in between, which a sign error or a swapped axis breaks
	const ladder = [1, 4, 8, 20].map(ratioAt);
	for (let i = 1; i < ladder.length; i++) {
		assert.ok(
			ladder[i] > ladder[i - 1],
			`the ratio should climb with stretch: ${ladder.map((r) => r.toFixed(2)).join(', ')}`
		);
	}
});

test('Woodgrain ring edges are continuous, not steps', () => {
	// The ring edge is where a pattern like this aliases. `fract` is genuinely
	// discontinuous, so shaping it directly falls to black and snaps back to
	// white between two adjacent pixels - and no amount of resolution helps,
	// because a jump is a jump at any scale.
	//
	// That is exactly what makes it testable. A continuous ramp gets *shallower*
	// the more pixels it is drawn across, so the largest step between neighbours
	// falls as the frame grows; a discontinuity does not move at all. Comparing
	// the two sizes tests the property rather than any particular threshold,
	// which is what a mean or a fixed bound failed to do - measured, the
	// sawtooth's mean step is actually *lower*, because the fix puts more pixels
	// on a slope.
	const worstStep = (size) => {
		const img = new CLARITY.Woodgrain({ seed: 3 }).process(new NodeImageData(size, size));
		let worst = 0;
		for (let y = 1; y < size; y++) {
			for (let x = 1; x < size; x++) {
				const here = img.data[(y * size + x) * 4];
				worst = Math.max(
					worst,
					Math.abs(here - img.data[((y - 1) * size + x) * 4]),
					Math.abs(here - img.data[(y * size + x - 1) * 4])
				);
			}
		}
		return worst;
	};

	const small = worstStep(200);
	const large = worstStep(800);

	// Measured: 202 -> 101 as it stands, against 249 -> 253 for the raw sawtooth.
	assert.ok(
		large < small * 0.75,
		`the largest step barely moved with resolution (${small} at 200px, ${large} at 800px), ` +
			'which is what a discontinuity looks like'
	);
});

test('Dither keeps the tone it throws the levels away from', () => {
	// The whole point. Quantising to two levels can only write 0 or 255, so the
	// only way a mid-grey survives is as a mixture in the right proportion - and
	// getting that proportion right is what separates a dither from a threshold.
	// `Posteriser` at two colours would flatten each of these to one value.
	const S = 64;
	const flat = (v) => {
		const f = new NodeImageData(S, S);
		for (let i = 0; i < f.data.length; i += 4) {
			f.data[i] = f.data[i + 1] = f.data[i + 2] = v;
			f.data[i + 3] = 255;
		}
		return f;
	};
	const mean = (img) => {
		let sum = 0;
		for (let i = 0; i < img.data.length; i += 4) sum += img.data[i];
		return sum / (img.data.length / 4);
	};

	for (const mode of ['bayer', 'diffusion']) {
		for (const grey of [40, 96, 128, 190, 220]) {
			const out = new CLARITY.Dither({ mode, monochrome: true, levels: 2 }).process(flat(grey));

			// nothing but the two levels came out
			for (let i = 0; i < out.data.length; i += 4) {
				assert.ok(out.data[i] === 0 || out.data[i] === 255, `${mode} wrote ${out.data[i]}, not a level`);
			}

			assert.ok(
				Math.abs(mean(out) - grey) < 3,
				`${mode} at grey ${grey} averaged ${mean(out).toFixed(1)}`
			);
		}
	}
});

test('Dither sends only the sequential half to the CPU', () => {
	// The one honest use of supportsGPU in the library, so it is asserted rather
	// than left to the GPU harness's summary line. Ordered needs nothing but its
	// own coordinates; Floyd-Steinberg reads pixels it has not written yet.
	assert.equal(CLARITY.Dither.supportsGPU(new CLARITY.Dither({})), true);
	assert.equal(CLARITY.Dither.supportsGPU(new CLARITY.Dither({ mode: 'bayer' })), true);
	assert.equal(CLARITY.Dither.supportsGPU(new CLARITY.Dither({ mode: 'diffusion' })), false);
});

test('Dither ordered mode tiles, and the two modes are really different', () => {
	// An ordered matrix repeats every `matrix` pixels, so a flat field comes out
	// seamlessly tileable and holds still between frames. That is a real reason
	// to keep the mode rather than only a look.
	const S = 32;
	const flat = new NodeImageData(S, S);
	for (let i = 0; i < flat.data.length; i += 4) {
		flat.data[i] = flat.data[i + 1] = flat.data[i + 2] = 128;
		flat.data[i + 3] = 255;
	}
	const at = (img, x, y) => img.data[(y * S + x) * 4];

	const ordered = new CLARITY.Dither({ monochrome: true, matrix: '8' }).process(flat);
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			assert.equal(at(ordered, x, y), at(ordered, x + 8, y + 8), `the 8x8 matrix did not repeat at ${x},${y}`);
		}
	}

	// The obvious companion claim - that diffusion never repeats - is false, and
	// worth recording rather than asserting: on a perfectly flat field
	// Floyd-Steinberg settles into a periodic pattern of its own, which is the
	// classic worm artifact. So what is asserted is the thing that is actually
	// true, that these are two algorithms rather than one written twice.
	const diffused = new CLARITY.Dither({ mode: 'diffusion', monochrome: true }).process(makeFrame());
	const same = new CLARITY.Dither({ mode: 'bayer', monochrome: true }).process(makeFrame());
	assert.notDeepEqual([...diffused.data], [...same.data], 'the two modes produced identical frames');
});

test('ChromaKey is blind to a neutral offset, which RGB distance is not', () => {
	// The defining claim, and the one that separates this from a colour-distance
	// filter. U and V are linear in RGB and the coefficients of each sum to zero,
	// so adding the same amount to all three channels moves a pixel nowhere in
	// chroma - the match cannot see haze, a lift, or ambient fill at all.
	//
	// Asserted against the *same* colours' RGB distance, because "within 1 byte"
	// on its own would also pass if the offsets were too small to matter. They
	// are not: the same pairs are up to 90 apart in RGB.
	const key = [0, 177, 64];
	const key1 = (rgb) => {
		const f = new NodeImageData(1, 1);
		f.data.set([...rgb, 255]);
		return new CLARITY.ChromaKey({}).process(f).data[3];
	};

	const base = key1(key);
	assert.equal(base, 0, 'the key colour itself did not key');

	let largestRGB = 0;
	for (const lift of [-40, -20, 20, 50, 90]) {
		const shifted = key.map((c) => Math.max(0, Math.min(255, c + lift)));
		// clipping at a channel end would be a real colour change, not an offset
		if (shifted.some((c, i) => c !== key[i] + lift)) continue;

		assert.equal(key1(shifted), base, `a lift of ${lift} changed the alpha`);
		largestRGB = Math.max(largestRGB, Math.hypot(...shifted.map((c, i) => c - key[i])));
	}

	assert.ok(largestRGB > 80, `the offsets tested were only ${largestRGB.toFixed(0)} apart in RGB`);

	// The control, and the reason the claim above says offset rather than
	// brightness. A neutral *gain* does move the match, because U and V are
	// linear rather than normalised - halving all three channels halves the
	// chroma with them. It takes a tolerance tighter than the default to show
	// it, since 60 is wide enough to absorb the 50 that halving costs, which is
	// the whole reason the default is that wide.
	const tight = (rgb) => {
		const f = new NodeImageData(1, 1);
		f.data.set([...rgb, 255]);
		return new CLARITY.ChromaKey({ tolerance: 10, softness: 0 }).process(f).data[3];
	};
	assert.equal(tight(key), 0, 'the key colour itself did not key at a tight tolerance');
	assert.equal(tight(key.map((c) => Math.round(c + 40))), 0, 'a lift stopped it keying at a tight tolerance');
	assert.equal(tight(key.map((c) => Math.round(c / 2))), 255, 'halving the key still keyed');

	// and a different hue at the same brightness is not keyed at all
	assert.equal(key1([64, 0, 177]), 255, 'a different hue was keyed');
});

test('ChromaKey multiplies alpha rather than assigning it', () => {
	// A frame arriving half transparent has to come back half transparent where
	// nothing matched. Assigning would hand every pixel its opacity back, which
	// is a silent failure - the frame looks right on white and wrong on anything
	// else, and only shows up when it is composited.
	const f = new NodeImageData(4, 1);
	//two that match the key, two that do not, at two opacities each
	const pixels = [[0, 177, 64, 90], [0, 177, 64, 255], [200, 60, 60, 90], [200, 60, 60, 255]];
	pixels.forEach((p, i) => f.data.set(p, i * 4));

	const out = new CLARITY.ChromaKey({}).process(f);
	assert.deepEqual([...out.data.filter((_, i) => i % 4 === 3)], [0, 0, 90, 255]);
});

test('ChromaKey spill takes colour off the key axis and leaves the rest alone', () => {
	// Suppression is the only thing here that writes colour, so it is asserted
	// separately from the keying: at tolerance 0 and softness 0 the only thing
	// that keys is a pixel sitting exactly on the key, and every difference
	// below is the suppression rather than the match.
	const run = (rgb, spill) => {
		const f = new NodeImageData(1, 1);
		f.data.set([...rgb, 255]);
		const out = new CLARITY.ChromaKey({ tolerance: 0, softness: 0, spill }).process(f);
		return [...out.data];
	};

	// A neutral has no chroma to take off, and so is untouched however hard the
	// suppression is pushed.
	assert.deepEqual(run([128, 128, 128], 1), [128, 128, 128, 255], 'grey moved');

	// Magenta is the opposite direction to the green key, so its projection onto
	// the key axis is negative - the `along > 0` branch. Suppressing it would
	// push it *further* from the key, which is the bug that branch exists to
	// prevent, so this is the assertion that guards it.
	assert.deepEqual(run([255, 0, 255], 1), [255, 0, 255, 255], 'magenta was suppressed');

	// The key colour is entirely on the axis, so full suppression leaves nothing
	// but its luma - a grey, at the brightness it came in at. Its alpha is 0
	// because it is the one colour a zero tolerance still matches, and the
	// colour is written regardless of alpha, which is what keeps a cut-out
	// composite-able rather than leaving black behind the transparency.
	const [r, g, b, a] = run([0, 177, 64], 1);
	assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1, `the key came back as ${[r, g, b]}, not neutral`);
	assert.equal(a, 0, 'the key colour itself did not key');

	// Partial suppression lands partway, and 0 does nothing at all.
	assert.deepEqual(run([0, 177, 64], 0), [0, 177, 64, 0], 'spill 0 changed the colour');
	const half = run([0, 177, 64], 0.5);
	assert.ok(half[1] < 177 && half[1] > g, `half suppression gave green ${half[1]}, not between 177 and ${g}`);
});

test('Histogram counts what is actually in the frame', () => {
	// The graph is only worth drawing if the numbers behind it are right, and a
	// golden image cannot tell a correct histogram from a plausible-looking one.
	// So this reads the bars `prepare` produced rather than the pixels it drew.
	const S = 64;
	const flat = (v) => {
		const f = new NodeImageData(S, S);
		for (let i = 0; i < f.data.length; i += 4) {
			f.data[i] = f.data[i + 1] = f.data[i + 2] = v;
			f.data[i + 3] = 255;
		}
		return f;
	};
	const heights = (filter) => [...filter.bars].filter((_, i) => i % 4 === 0);

	// One tone means one occupied bin, at the index that tone falls in, and
	// nothing anywhere else.
	for (const [value, bins] of [[0, 64], [128, 64], [255, 64], [64, 16]]) {
		const filter = new CLARITY.Histogram({ bins, mode: 'luma' });
		filter.process(flat(value));
		const expected = Math.min(bins - 1, Math.floor((value / 256) * bins));
		const occupied = heights(filter).map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0);
		assert.deepEqual(occupied, [expected], `a flat ${value} at ${bins} bins landed in the wrong bin`);
		assert.equal(heights(filter)[expected], 255, 'the only occupied bin was not full height');
	}

	// Every value 0-255 exactly once has to come back as a perfectly flat
	// histogram, because 256 values divided into 64 bins is four values a bin
	// with nothing left over.
	//
	const ramp = new NodeImageData(16, 16);
	for (let v = 0; v < 256; v++) {
		ramp.data[v * 4] = ramp.data[v * 4 + 1] = ramp.data[v * 4 + 2] = v;
		ramp.data[v * 4 + 3] = 255;
	}
	for (const bins of [8, 64, 100, 256]) {
		const flatFilter = new CLARITY.Histogram({ bins, mode: 'luma' });
		flatFilter.process(ramp);
		const spread = [...new Set(heights(flatFilter))];
		// 100 does not divide 256, so those bins hold two values or three and the
		// graph is legitimately ragged - what has to hold everywhere is that no
		// bin is empty and none is more than one value taller than another
		const expected = 256 % bins === 0 ? [255] : [Math.round((2 / 3) * 255), 255];
		assert.deepEqual(spread.sort((a, b) => a - b), expected, `every value once, ${bins} bins`);
	}

	// The same frame pins the *boundaries* as well as the heights, which
	// flatness cannot: the 0-255 range is divided into `bins` equal parts, so
	// value v belongs to bin floor(v * bins / 256).
	//
	// Worth stating separately because the obvious off-by-one here - dividing by
	// 255 rather than 256 - is not merely hard to see, it is genuinely
	// *identical* for every power-of-two bin count, clamp included. It only
	// diverges where the bins do not divide the range, which is why this checks
	// at 100 bins and the flatness above cannot catch it at any of the others.
	const single = (v) => {
		const f = new NodeImageData(1, 1);
		f.data.set([v, v, v, 255]);
		return f;
	};
	for (const bins of [100, 17]) {
		for (let v = 0; v < 256; v++) {
			const filter = new CLARITY.Histogram({ bins, mode: 'luma' });
			filter.process(single(v));
			const landed = heights(filter).findIndex((h) => h > 0);
			assert.equal(landed, Math.floor((v * bins) / 256), `value ${v} at ${bins} bins`);
		}
	}

	// Half the frame at one tone and half at another is two bins of equal
	// height - which is the assertion that the counting is proportional rather
	// than merely non-zero in the right places.
	const split = new NodeImageData(S, S);
	for (let y = 0; y < S; y++) {
		for (let x = 0; x < S; x++) {
			const i = (y * S + x) * 4;
			const v = y < S / 2 ? 32 : 200;
			split.data[i] = split.data[i + 1] = split.data[i + 2] = v;
			split.data[i + 3] = 255;
		}
	}
	const even = new CLARITY.Histogram({ bins: 64, mode: 'luma' });
	even.process(split);
	assert.deepEqual(
		heights(even).map((h, i) => (h > 0 ? [i, h] : null)).filter(Boolean),
		[[8, 255], [50, 255]],
		'an even split did not give two bins of equal height'
	);

	// The three curves share one scale, so a channel that is genuinely flat
	// reads as flat rather than being stretched up to match the others.
	const skewed = new NodeImageData(S, S);
	for (let y = 0; y < S; y++) {
		for (let x = 0; x < S; x++) {
			const i = (y * S + x) * 4;
			skewed.data[i] = (x * 4) % 256;   // red spread across every bin
			skewed.data[i + 1] = 100;          // green all in one
			skewed.data[i + 2] = 100;
			skewed.data[i + 3] = 255;
		}
	}
	const rgb = new CLARITY.Histogram({ bins: 64 });
	rgb.process(skewed);
	const green = [...rgb.bars].filter((_, i) => i % 4 === 1);
	assert.equal(Math.max(...green), 255, "green's single bin should be the tallest thing in the frame");
	assert.ok(
		Math.max(...heights(rgb)) < 40,
		`red spread over every bin should be dwarfed by it, but reached ${Math.max(...heights(rgb))}`
	);
});

test('Histogram log scale rescues a frame one tone dominates', () => {
	// The measurement that put the option there, kept as a test so it stays
	// true. Linear normalisation is fine until one bin holds most of the frame
	// and then falls off a cliff - so both halves are asserted, because an
	// always-on log scale would pass the second half and be the wrong filter.
	const W = 64;
	const H = 48;
	const dominated = (share) => {
		const f = new NodeImageData(W, H);
		const cut = Math.round(H * share);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const i = (y * W + x) * 4;
				const v = y < cut ? 0 : Math.round((x / W) * 255);
				f.data[i] = f.data[i + 1] = f.data[i + 2] = v;
				f.data[i + 3] = 255;
			}
		}
		return f;
	};
	// bins that hold pixels but render at zero height
	const vanished = (frame, log) => {
		const filter = new CLARITY.Histogram({ bins: 64, mode: 'luma', log });
		filter.process(frame);
		const counts = new Array(64).fill(0);
		for (let i = 0; i < frame.data.length; i += 4) {
			counts[Math.min(63, Math.floor((filter.getColourValue(frame, i, 'grey') / 256) * 64))]++;
		}
		return counts.filter((count, bin) => count > 0 && filter.bars[bin * 4] === 0).length;
	};

	assert.equal(vanished(dominated(0.7), false), 0, 'linear lost bins at 70%, which is inside the range it handles');
	assert.ok(vanished(dominated(0.9), false) > 50, 'linear survived 90% dominance, so the log option has no reason to exist');
	assert.equal(vanished(dominated(0.9), true), 0, 'the log scale did not rescue the flattened bins');
	assert.equal(vanished(dominated(0.97), true), 0, 'the log scale did not rescue 97% dominance');

	// Both scales have to agree at the ends, so switching it on rescales the
	// middle rather than moving the graph.
	for (const log of [false, true]) {
		const filter = new CLARITY.Histogram({ bins: 64, mode: 'luma', log });
		filter.process(dominated(0.9));
		const bars = [...filter.bars].filter((_, i) => i % 4 === 0);
		assert.equal(Math.max(...bars), 255, `${log ? 'log' : 'linear'} did not send the tallest bin to full height`);
		assert.equal(bars[63], 0, `${log ? 'log' : 'linear'} gave an empty bin a height`);
	}
});

test('Histogram draws only where it says it will', () => {
	// `height` is a promise about which rows are touched, and `opacity` a
	// promise that the empty part of the graph is not a translucent box over the
	// picture. Both are easy to get subtly wrong and invisible in a thumbnail.
	const source = makeFrame();
	const filter = new CLARITY.Histogram({ height: 0.25 });
	const out = filter.process(source);

	const rowChanged = (y) => {
		for (let x = 0; x < source.width; x++) {
			const i = (y * source.width + x) * 4;
			if (out.data[i] !== source.data[i] || out.data[i + 1] !== source.data[i + 1] || out.data[i + 2] !== source.data[i + 2]) {
				return true;
			}
		}
		return false;
	};

	const firstRow = source.height - source.height * 0.25;
	for (let y = 0; y < Math.floor(firstRow); y++) {
		assert.ok(!rowChanged(y), `row ${y} was touched, above the graph's top at ${firstRow}`);
	}
	let touched = 0;
	for (let y = Math.ceil(firstRow); y < source.height; y++) {
		if (rowChanged(y)) touched++;
	}
	assert.ok(touched > 0, 'the graph drew nothing at all');

	// A bin with no pixels in it leaves its column alone all the way down,
	// including the bottom row - that is the opacity promise.
	const bars = [...filter.bars].filter((_, i) => i % 4 === 0);
	const emptyBin = bars.findIndex((h) => h === 0);
	assert.ok(emptyBin >= 0, 'the fixture filled every bin, so the empty-column claim is untested');
	const column = Math.floor(((emptyBin + 0.5) / filter.properties.bins) * source.width);
	const bottom = (source.height - 1) * source.width * 4 + column * 4;
	assert.deepEqual(
		[out.data[bottom], out.data[bottom + 1], out.data[bottom + 2]],
		[source.data[bottom], source.data[bottom + 1], source.data[bottom + 2]],
		'an empty bin veiled the picture behind it'
	);
});
