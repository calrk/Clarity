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
		new CLARITY.Sharpen({ intensity: 0.8 }),
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
		[2, 'intensity', 1.4],
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

	pipeline.at(2).setProperty('intensity', 2);
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
	// Noise re-randomises per call. Caching it would freeze the grain, which
	// looks like the filter has stopped working.
	const pipeline = new CLARITY.Pipeline([
		new CLARITY.Noise({ intensity: 40, random: CLARITY.seededRandom(1) })
	]);
	const frame = makeFrame();

	const first = bytes(pipeline.run(frame));
	const second = bytes(pipeline.run(frame));

	assert.equal(pipeline.stats.from, 0, 'ran again despite nothing being dirty');
	assert.notDeepEqual(second, first, 'and produced new noise');
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
	// Noise at the front, and the playground should be able to show it
	const pipeline = new CLARITY.Pipeline([
		new CLARITY.Noise({ intensity: 20, random: CLARITY.seededRandom(2) }),
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
		new CLARITY.Noise({ intensity: 20, random: CLARITY.seededRandom(2) })
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
	const varying = ['Noise', 'Cloud', 'Wave'];

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
