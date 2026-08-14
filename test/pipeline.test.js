// The pipeline's whole value is that it *doesn't* do work. That makes it
// exactly the kind of component where a bug is invisible: a stale cache looks
// like a working render until you notice the picture stopped responding.
//
// So the central assertion here is equivalence - a cached run must produce
// byte-identical output to the same chain run with the cache thrown away.
// Everything else is about what triggers a recompute.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as CLARITY from '../dist/clarity.js';

class NodeImageData {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Uint8ClampedArray(width * height * 4);
	}
}
CLARITY.setImageDataFactory((w, h) => new NodeImageData(w, h));

const W = 24;
const H = 18;

function makeFrame(seed = 0) {
	const f = new NodeImageData(W, H);
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const i = (y * W + x) * 4;
			f.data.set([(x * 9 + seed) % 256, (y * 13) % 256, x < W / 2 ? 40 : 200, 255], i);
		}
	}
	return f;
}

const bytes = (frame) => [...frame.data];

/** A chain with a mix of pointwise, kernel and accumulating filters. */
function buildChain() {
	return [
		new CLARITY.Desaturate({}),
		new CLARITY.Blur({ radius: 3 }),
		new CLARITY.Convolver({ preset: 'sharpen', amount: 0.8 }),
		new CLARITY.ValueThreshold({ threshold: 120 })
	];
}

test('a pipeline produces the same result as chaining process() by hand', () => {
	const frame = makeFrame();

	let expected = makeFrame();
	for (const filter of buildChain()) {
		expected = filter.process(expected);
	}

	const actual = new CLARITY.Pipeline(buildChain()).run(frame);
	assert.deepEqual(bytes(actual), bytes(expected));
});

test('an empty pipeline passes the frame through', () => {
	const frame = makeFrame();
	assert.equal(new CLARITY.Pipeline().run(frame), frame);
});

test('cached output is identical to output computed from scratch', () => {
	// the assertion that matters. Poke properties at various depths and check
	// the incrementally-cached pipeline never disagrees with a cold one.
	const cached = new CLARITY.Pipeline(buildChain());
	const cold = new CLARITY.Pipeline(buildChain());
	const frame = makeFrame();

	const pokes = [
		[1, 'radius', 6],
		[3, 'threshold', 90],
		[0, null, null],
		[2, 'amount', 1.4],
		[1, 'radius', 2],
		[3, 'inverted', true],
		[3, 'threshold', null]
	];

	for (const [index, key, value] of pokes) {
		if (key !== null) {
			cached.at(index).setProperty(key, value);
			cold.at(index).setProperty(key, value);
		}

		cold.invalidate();
		const a = cached.run(frame);
		const b = cold.run(frame);

		assert.equal(cold.stats.from, 0, 'the cold pipeline really did recompute everything');
		assert.deepEqual(bytes(a), bytes(b), `after setting ${index}.${key} = ${value}`);
	}
});

test('an unchanged chain on an unchanged frame does no work at all', () => {
	const pipeline = new CLARITY.Pipeline(buildChain());
	const frame = makeFrame();

	const first = pipeline.run(frame);
	assert.equal(pipeline.stats.from, 0, 'the first run computes everything');

	const second = pipeline.run(frame);
	assert.equal(pipeline.stats.from, -1, 'the second run computes nothing');
	assert.equal(pipeline.stats.skipped, 4);
	assert.equal(pipeline.stats.total, 0);
	assert.equal(second, first, 'and hands back the same frame');
});

test('a property change recomputes from that stage down, and no earlier', () => {
	const pipeline = new CLARITY.Pipeline(buildChain());
	const frame = makeFrame();
	pipeline.run(frame);

	pipeline.at(2).setProperty('amount', 2);
	pipeline.run(frame);

	assert.equal(pipeline.stats.from, 2);
	assert.equal(pipeline.stats.skipped, 2, 'the two stages before it were reused');
	assert.equal(pipeline.stats.timings[0], 0);
	assert.equal(pipeline.stats.timings[1], 0);
});

test('a new source frame invalidates the whole chain', () => {
	const pipeline = new CLARITY.Pipeline(buildChain());
	pipeline.run(makeFrame(0));
	pipeline.run(makeFrame(1));
	assert.equal(pipeline.stats.from, 0);
});

test('toggling enabled invalidates the cache', () => {
	const pipeline = new CLARITY.Pipeline(buildChain());
	const frame = makeFrame();

	const before = bytes(pipeline.run(frame));
	pipeline.at(1).enabled = false;

	const after = pipeline.run(frame);
	assert.equal(pipeline.stats.from, 1, 'recomputes from the filter that was bypassed');
	assert.notDeepEqual(bytes(after), before, 'and the picture actually changed');

	// setting it to the value it already has is not a change
	pipeline.run(frame);
	pipeline.at(1).enabled = false;
	pipeline.run(frame);
	assert.equal(pipeline.stats.from, -1);
});

test('reordering invalidates and changes the result', () => {
	const frame = makeFrame();
	const pipeline = new CLARITY.Pipeline([
		new CLARITY.Invert({}),
		new CLARITY.ValueThreshold({ threshold: 100 })
	]);

	const before = bytes(pipeline.run(frame));
	pipeline.move(0, 1);
	const after = pipeline.run(frame);

	assert.equal(pipeline.stats.from, 0);
	// invert-then-threshold and threshold-then-invert are not the same picture
	assert.notDeepEqual(bytes(after), before);
});

test('add and remove invalidate', () => {
	const pipeline = new CLARITY.Pipeline([new CLARITY.Desaturate({})]);
	const frame = makeFrame();

	pipeline.run(frame);
	pipeline.add(new CLARITY.Invert({}));
	pipeline.run(frame);
	assert.equal(pipeline.stats.from, 0);

	pipeline.run(frame);
	pipeline.remove(1);
	pipeline.run(frame);
	assert.equal(pipeline.stats.from, 0);
	assert.equal(pipeline.length, 1);
});

test('a varying filter re-runs every frame and is never cached', () => {
	// Wave reads the clock, so caching it would freeze the animation - which
	// looks like the filter has stopped working. This used to use Noise, back
	// when Noise re-rolled its seed on every call rather than holding one.
	let clock = 0;
	const pipeline = new CLARITY.Pipeline([
		new CLARITY.Wave({ amplitude: 6, now: () => (clock += 120) })
	]);
	const frame = makeFrame();

	const first = bytes(pipeline.run(frame));
	const second = bytes(pipeline.run(frame));

	assert.equal(pipeline.stats.from, 0, 'ran again despite nothing being dirty');
	assert.notDeepEqual(second, first, 'and produced a new frame');
});

test('a stateful filter sees every frame exactly once', () => {
	// Ghoster builds a trail, so being skipped leaves a gap and being run twice
	// double-counts a frame. Both are silent.
	const ghoster = new CLARITY.Ghoster({ length: 5 });
	const pipeline = new CLARITY.Pipeline([ghoster]);

	for (let i = 0; i < 3; i++) {
		pipeline.run(makeFrame(i));
	}
	assert.equal(ghoster.frames.length, 3);

	// three renders of the *same* frame still have to reach it
	const same = makeFrame(9);
	pipeline.run(same);
	pipeline.run(same);
	assert.equal(ghoster.frames.length, 5);
});

test('an impure filter early in the chain defeats caching downstream', () => {
	// worth asserting rather than assuming - it is the honest cost of putting
	// an animating filter at the front, and the playground should be able to show it
	const pipeline = new CLARITY.Pipeline([
		new CLARITY.Wave({ amplitude: 4, now: () => Date.now() }),
		new CLARITY.Blur({ radius: 3 }),
		new CLARITY.Invert({})
	]);
	const frame = makeFrame();

	pipeline.run(frame);
	pipeline.run(frame);
	assert.equal(pipeline.stats.from, 0);
	assert.equal(pipeline.stats.skipped, 0, 'nothing can be reused behind it');

	// the same filter at the end costs only itself
	const tail = new CLARITY.Pipeline([
		new CLARITY.Blur({ radius: 3 }),
		new CLARITY.Invert({}),
		new CLARITY.Wave({ amplitude: 4, now: () => Date.now() })
	]);
	tail.run(frame);
	tail.run(frame);
	assert.equal(tail.stats.skipped, 2);
});

test('a two-input filter takes its second frame from the stage options', () => {
	const mask = makeFrame(50);
	const pipeline = new CLARITY.Pipeline()
		.add(new CLARITY.Desaturate({}))
		.add(new CLARITY.Mask({}), { second: mask });

	const frame = makeFrame();
	const actual = pipeline.run(frame);

	const expected = new CLARITY.Mask({}).process([
		new CLARITY.Desaturate({}).process(makeFrame()),
		mask
	]);
	assert.deepEqual(bytes(actual), bytes(expected));
});

test('a pipeline can be the second input to another', () => {
	const frame = makeFrame();

	const maskChain = new CLARITY.Pipeline([
		new CLARITY.Desaturate({}),
		new CLARITY.ValueThreshold({ threshold: 110 })
	]);

	const main = new CLARITY.Pipeline()
		.add(new CLARITY.Invert({}))
		.add(new CLARITY.Mask({}), { second: maskChain });

	const actual = main.run(frame);

	let expectedMask = makeFrame();
	for (const f of [new CLARITY.Desaturate({}), new CLARITY.ValueThreshold({ threshold: 110 })]) {
		expectedMask = f.process(expectedMask);
	}
	const expected = new CLARITY.Mask({}).process([
		new CLARITY.Invert({}).process(makeFrame()),
		expectedMask
	]);

	assert.deepEqual(bytes(actual), bytes(expected));
});

test('a second input given as a function is called each run', () => {
	let calls = 0;
	const pipeline = new CLARITY.Pipeline().add(new CLARITY.Blend({ ratio: 0.5 }), {
		second: () => {
			calls++;
			return makeFrame(7);
		}
	});

	pipeline.run(makeFrame(0));
	pipeline.run(makeFrame(1));
	assert.equal(calls, 2);
});

test('stateful and varying filters are declared, and nothing else is', () => {
	const stateful = ['Ghoster', 'MotionDetector', 'DifferenceDetector'];
	// Only the ones that read the *clock*. Noise, Cloud and Voronoi used to be
	// here on the strength of reading `random` instead, which is a different
	// thing: they draw the same picture forever once their seed is fixed, and
	// being impure only meant they could never be cached.
	const varying = ['Wave', 'DotCrawl', 'GradientMap'];

	for (const name of stateful) {
		assert.equal(CLARITY[name].stateful, true, `${name} is stateful`);
		assert.equal(CLARITY[name].pure, false);
	}
	for (const name of varying) {
		assert.equal(CLARITY[name].varying, true, `${name} is varying`);
		assert.equal(CLARITY[name].pure, false);
	}

	// everything else must be safe to cache, so a new impure filter that forgets
	// to declare itself fails here rather than showing a frozen picture
	assert.equal(CLARITY.Blur.pure, true);
	assert.equal(CLARITY.Puzzler.pure, true, 'Puzzler shuffles once, in its constructor');
	for (const name of ['Cloud', 'Voronoi', 'Noise']) {
		assert.equal(CLARITY[name].pure, true, `${name} hashes from a fixed seed now`);
	}
});

test('invalidate forces a full recompute', () => {
	const pipeline = new CLARITY.Pipeline(buildChain());
	const frame = makeFrame();

	pipeline.run(frame);
	pipeline.run(frame);
	assert.equal(pipeline.stats.from, -1);

	pipeline.invalidate();
	pipeline.run(frame);
	assert.equal(pipeline.stats.from, 0);
});

// A trail, a ring or a reference frame is only meaningful if it was built from
// an unbroken run of frames through the same filter in the same place with the
// same settings. These are the four things that break that, and each one has to
// throw the history away rather than blending the old with the new.
test('retained frames are dropped when the history stops being trustworthy', () => {
	const ghoster = new CLARITY.Ghoster({ length: 4 });
	const pipeline = new CLARITY.Pipeline([ghoster], { gpu: false });

	for (let i = 0; i < 4; i++) pipeline.run(makeFrame(i));
	assert.equal(ghoster.frames.length, 4, 'the trail filled up');

	//a property change
	ghoster.setProperty('length', 6);
	pipeline.run(makeFrame(9));
	assert.equal(ghoster.frames.length, 1, 'a property change starts the trail again');

	//the chain being edited
	for (let i = 0; i < 3; i++) pipeline.run(makeFrame(i));
	pipeline.add(new CLARITY.Invert({}));
	pipeline.run(makeFrame(9));
	assert.equal(ghoster.frames.length, 1, 'editing the chain starts the trail again');

	//leaving the chain, so that coming back does not resume a stale trail
	for (let i = 0; i < 3; i++) pipeline.run(makeFrame(i));
	pipeline.remove(ghoster);
	assert.equal(ghoster.frames.length, 0, 'removal drops it immediately');
});

test('a rebuilt chain gives a stateful filter the same output as a fresh one', () => {
	const kept = new CLARITY.DifferenceDetector({});
	const pipeline = new CLARITY.Pipeline([kept], { gpu: false });

	pipeline.run(makeFrame(0));
	pipeline.run(makeFrame(1));

	//the reference frame came from makeFrame(0); after an edit it must come from
	//whatever is fed next instead, exactly as a filter that had never run
	pipeline.invalidate();
	const after = bytes(pipeline.run(makeFrame(5)));

	const fresh = new CLARITY.Pipeline([new CLARITY.DifferenceDetector({})], { gpu: false });
	assert.deepEqual(after, bytes(fresh.run(makeFrame(5))));
});

test('MotionDetector.reset restores the indices the constructor set', () => {
	const detector = new CLARITY.MotionDetector({ frameCount: 3 });
	const pipeline = new CLARITY.Pipeline([detector], { gpu: false });

	for (let i = 0; i < 6; i++) pipeline.run(makeFrame(i));
	detector.reset();

	assert.equal(detector.frames.length, 0);
	assert.equal(detector.index, 0);
	assert.equal(detector.preindex, 3, 'preindex starts at frameCount, not frameCount-1');
});

// The reason `resize` is the default fit: it is the only one where a rotation
// can be undone. Under `crop` the trimmed edges are gone for good, so a chain
// that rotates, does something, and rotates back cannot get the frame it
// started with.
test('a quarter turn and back is the identity', () => {
	const there = new CLARITY.Rotator({ turns: 1 });
	const back = new CLARITY.Rotator({ turns: 3 });
	const frame = makeFrame();

	const turned = there.process(frame);
	assert.equal(turned.width, H, 'a quarter turn swaps the dimensions');
	assert.equal(turned.height, W);

	const returned = back.process(turned);
	assert.equal(returned.width, W);
	assert.equal(returned.height, H);
	assert.deepEqual(bytes(returned), bytes(frame));
});

test('a GPU stage may change the frame size', () => {
	const pipeline = new CLARITY.Pipeline([new CLARITY.Rotator({ turns: 1 })], { gpu: false });
	const out = pipeline.run(makeFrame());

	//the CPU half of the same contract the GPU executor relies on: outputSize()
	//has to agree with what the filter actually produces, because the executor
	//allocates its render target from it before the shader runs
	const declared = CLARITY.Rotator.outputSize(pipeline.at(0), W, H);
	assert.equal(out.width, declared.width);
	assert.equal(out.height, declared.height);
});

// --- what history survives ----------------------------------------------
//
// The rule is that a stateful filter's history is discarded when the pipeline
// is edited, when the filter leaves the chain, or when *that filter's own*
// properties change. Not when anything upstream of it changes - which is the
// case that matters, because animating a chain means dirtying a filter on
// every single frame.
//
// The motivating stack is scrolling fog: Cloud into Translator, with the
// translation advanced each frame, feeding something temporal. If an upstream
// property change reset the trail, that whole class of effect would be
// impossible and the failure would look like "Ghoster does nothing".

test('a dirty upstream filter does not clear a downstream trail', () => {
	const translator = new CLARITY.Translator({ horizontal: 10 });
	const ghoster = new CLARITY.Ghoster({ length: 10 });
	const pipeline = new CLARITY.Pipeline([new CLARITY.Cloud({}), translator, ghoster], { gpu: false });

	for (let i = 0; i < 5; i++) pipeline.run(makeFrame());
	assert.equal(ghoster.frames.length, 5, 'the trail should build up over five frames');

	// scroll the fog, the way an animation loop would
	for (let i = 0; i < 4; i++) {
		translator.setProperty('horizontal', 10 + i);
		assert.equal(translator.dirty, true, 'the premise: changing a property dirties that filter');
		pipeline.run(makeFrame());
	}

	assert.equal(ghoster.frames.length, 9, 'the trail kept growing rather than restarting');
});

test('a dirty upstream filter does not drop a difference reference', () => {
	const translator = new CLARITY.Translator({ horizontal: 10 });
	const detector = new CLARITY.DifferenceDetector({});
	const pipeline = new CLARITY.Pipeline([translator, detector], { gpu: false });

	pipeline.run(makeFrame());
	const reference = detector.original;
	assert.ok(reference, 'the first frame is captured as the reference');

	translator.setProperty('horizontal', 25);
	pipeline.run(makeFrame());
	assert.equal(detector.original, reference, 'the reference frame must be the same object, not recaptured');
});

test('but a filter still forgets when it, or the chain, changes', () => {
	// the other half of the rule - without these the test above would pass on a
	// pipeline that simply never cleared anything
	const ghoster = new CLARITY.Ghoster({ length: 10 });
	const pipeline = new CLARITY.Pipeline([new CLARITY.Translator({ horizontal: 5 }), ghoster], { gpu: false });

	for (let i = 0; i < 5; i++) pipeline.run(makeFrame());
	assert.equal(ghoster.frames.length, 5);

	ghoster.setProperty('length', 12);
	pipeline.run(makeFrame());
	assert.equal(ghoster.frames.length, 1, 'changing the filter itself restarts its trail');

	for (let i = 0; i < 4; i++) pipeline.run(makeFrame());
	assert.equal(ghoster.frames.length, 5);

	pipeline.add(new CLARITY.Invert({}));
	pipeline.run(makeFrame());
	assert.equal(ghoster.frames.length, 1, 'editing the chain restarts it too');
});

test('a borrowed backend is not disposed by the borrower', () => {
	// A browser allows only a handful of live WebGL contexts, so several
	// pipelines on one page share. Sharing is only safe if the first branch to
	// be thrown away leaves the context alone - otherwise disposing a nested
	// pipeline takes down the one that lent it.
	//
	// No WebGL in Node, so the backend is a stand-in. What is being tested is
	// the ownership rule, which is pure bookkeeping.
	let disposed = 0;
	const shared = { lost: false, dispose: () => disposed++ };

	const borrower = new CLARITY.Pipeline([], { backend: shared });
	borrower.dispose();
	assert.equal(disposed, 0, 'the borrower disposed a context it did not create');

	// and the lender still can
	shared.dispose();
	assert.equal(disposed, 1);
});

test('a pipeline given no backend still owns the one it makes', () => {
	// The other half of the rule. Without WebGL there is nothing to create, so
	// this asserts the flag rather than the disposal: a pipeline that was never
	// lent anything must not think it borrowed.
	const own = new CLARITY.Pipeline([], { gpu: false });
	assert.doesNotThrow(() => own.dispose());
	assert.equal(own.usingGPU, false);
});

test('a pipeline knows whether anything in it moves, branches included', () => {
	// The question a host asks to decide whether to run a frame loop over a still
	// image. Answering it with `filters.some(...)` is confidently wrong for a
	// chain whose only moving part is inside a second input - and that is not a
	// corner case, it is what compositing two generated fields looks like.
	const still = new CLARITY.Pipeline([new CLARITY.Invert()], { gpu: false });
	assert.equal(still.animated, false);

	const moving = new CLARITY.Pipeline([new CLARITY.Wave({ speed: 1 })], { gpu: false });
	assert.equal(moving.animated, true);

	// nothing at the top level moves here; the Translator is in the branch
	const drift = new CLARITY.Pipeline(
		[new CLARITY.Cloud({ seed: 1 }), new CLARITY.Translator({ horizontal: 0.2, speed: 0.1 })],
		{ gpu: false }
	);
	const composed = new CLARITY.Pipeline([], { gpu: false });
	composed.add(new CLARITY.Multiply(), { second: drift });

	assert.equal(composed.filters.some((f) => f.constructor.animated(f)), false, 'the premise');
	assert.equal(composed.animated, true, 'a moving branch has to count');

	// and a bypassed stage takes its branch out with it
	composed.at(0).enabled = false;
	assert.equal(composed.animated, false);
});

test('a still branch does not start a frame loop', () => {
	// The other direction, or `animated` could just answer yes for anything with
	// a second input and nobody would notice until their battery went flat.
	const still = new CLARITY.Pipeline([new CLARITY.Cloud({ seed: 1 })], { gpu: false });
	const composed = new CLARITY.Pipeline([], { gpu: false });
	composed.add(new CLARITY.Multiply(), { second: still });

	assert.equal(composed.animated, false);

	// a function second input is unknowable, so it is assumed still for the same
	// reason - guessing yes would run the loop forever for every chain with a
	// two-input filter in it
	const guessed = new CLARITY.Pipeline([], { gpu: false });
	guessed.add(new CLARITY.Multiply(), { second: () => makeFrame() });
	assert.equal(guessed.animated, false);
});

test('a moving branch keeps the chain out of the cache', () => {
	// The bug this exists for looks like nothing at all: two `Multiply` stages
	// composing a pair of drifting fields are both pure by their own reckoning,
	// so the chain is served from cache forever and the fog sits still - with the
	// frame loop running the whole time, producing identical frames.
	const clock = { now: 0 };
	const drift = new CLARITY.Pipeline(
		[
			new CLARITY.Cloud({ seed: 1 }),
			new CLARITY.Translator({ horizontal: 0.4, speed: 1, now: () => clock.now })
		],
		{ gpu: false }
	);

	const chain = new CLARITY.Pipeline([], { gpu: false });
	chain.add(new CLARITY.Multiply(), { second: drift });

	const source = makeFrame();
	const first = chain.run(source);
	assert.equal(chain.stable, false, 'a chain with a moving branch is not stable');

	clock.now = 500;
	const second = chain.run(source);

	assert.equal(chain.stats.from, 0, 'the chain was served from cache while its branch moved');
	assert.notDeepEqual([...second.data], [...first.data], 'the picture did not move');
});

test('a still chain is still served from cache', () => {
	// The other direction. Treating every two-input stage as volatile would fix
	// the fog by never caching anything, which is not a fix.
	const stencil = new CLARITY.Pipeline([new CLARITY.Cloud({ seed: 2 })], { gpu: false });
	const chain = new CLARITY.Pipeline([], { gpu: false });
	chain.add(new CLARITY.Multiply(), { second: stencil });

	const source = makeFrame();
	chain.run(source);
	chain.run(source);

	assert.equal(chain.stable, true);
	assert.equal(chain.stats.from, -1, 'a still chain should cost nothing to re-run');
});
