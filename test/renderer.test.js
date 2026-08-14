// Renderer is the browser half, so it gets a canvas stub rather than a real
// DOM. What is worth testing here is not the drawing - that is the browser's
// job - but the source handling, because that is where the cache is won or
// lost: read a still image twice and you hand the pipeline a new object each
// frame, and every stage recomputes forever.
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

/** Minimal 2d context: records what was put, hands back what was drawn. */
class StubContext {
	constructor(canvas) {
		this.canvas = canvas;
		this.put = null;
		this.reads = 0;
	}
	putImageData(frame) {
		this.put = frame;
	}
	drawImage(source) {
		this.drawn = source;
	}
	getImageData(x, y, width, height) {
		this.reads++;
		const frame = new NodeImageData(width, height);
		// something non-uniform, so filters have work to do
		for (let i = 0; i < frame.data.length; i += 4) {
			frame.data.set([(i / 4) % 256, 90, 200, 255], i);
		}
		return frame;
	}
}

class StubCanvas {
	constructor(width = 0, height = 0) {
		this.width = width;
		this.height = height;
		this.context = new StubContext(this);
		// the renderer makes a scratch canvas to draw the source into and reads
		// back from that, so tests need a handle on the ones it creates
		this.created = [];
		this.ownerDocument = {
			createElement: () => {
				const canvas = new StubCanvas();
				this.created.push(canvas);
				return canvas;
			}
		};
	}
	getContext() {
		return this.context;
	}
	/** How many times the renderer has read a frame back out of its scratch. */
	get scratchReads() {
		return this.created.reduce((total, canvas) => total + canvas.context.reads, 0);
	}
}

const frameOf = (w, h) => {
	const f = new NodeImageData(w, h);
	for (let i = 0; i < f.data.length; i += 4) f.data.set([(i / 4) % 256, 20, 180, 255], i);
	return f;
};

test('a renderer with no source renders nothing', () => {
	const renderer = new CLARITY.Renderer(new StubCanvas(8, 8));
	assert.equal(renderer.render(), undefined);
});

test('an ImageData source is passed straight through the pipeline', () => {
	const canvas = new StubCanvas(4, 3);
	const source = frameOf(4, 3);

	const renderer = new CLARITY.Renderer(canvas).source(source).add(new CLARITY.Invert({}));

	const out = renderer.render();
	assert.equal(canvas.context.put, out);
	assert.equal(out.data[0], 255 - source.data[0]);
});

test('a still source is read once, so the cache can actually hit', () => {
	const canvas = new StubCanvas(4, 3);
	const image = new StubCanvas(4, 3);

	const renderer = new CLARITY.Renderer(canvas)
		.source(image, { live: false })
		.add(new CLARITY.Desaturate({}))
		.add(new CLARITY.Invert({}));

	renderer.render();
	assert.equal(renderer.stats.from, 0, 'first frame computes everything');

	renderer.render();
	renderer.render();
	assert.equal(renderer.stats.from, -1, 'later frames compute nothing');
	assert.equal(canvas.scratchReads, 1, 'and the source is only read once');
});

test('a live source is re-read every frame', () => {
	const canvas = new StubCanvas(4, 3);
	const video = new StubCanvas(4, 3);

	const renderer = new CLARITY.Renderer(canvas)
		.source(video, { live: true })
		.add(new CLARITY.Invert({}));

	renderer.render();
	renderer.render();
	assert.equal(canvas.scratchReads, 2);
	assert.equal(renderer.stats.from, 0);
});

test('invalidateSource forces one re-read of a still source', () => {
	const canvas = new StubCanvas(4, 3);
	const image = new StubCanvas(4, 3);

	const renderer = new CLARITY.Renderer(canvas)
		.source(image, { live: false })
		.add(new CLARITY.Invert({}));

	renderer.render();
	renderer.render();
	assert.equal(canvas.scratchReads, 1);

	renderer.invalidateSource();
	renderer.render();
	assert.equal(canvas.scratchReads, 2);
	assert.equal(renderer.stats.from, 0, 'a re-read invalidates the chain');
});

test('changing the source invalidates every cached stage', () => {
	const canvas = new StubCanvas(4, 3);
	const renderer = new CLARITY.Renderer(canvas)
		.source(frameOf(4, 3))
		.add(new CLARITY.Desaturate({}));

	renderer.render();
	renderer.render();
	assert.equal(renderer.stats.from, -1);

	renderer.source(frameOf(4, 3));
	renderer.render();
	assert.equal(renderer.stats.from, 0);
});

test('a filter that changes the frame size resizes the canvas', () => {
	// Rotator on a non-square frame is the case that matters
	const canvas = new StubCanvas(4, 3);
	const renderer = new CLARITY.Renderer(canvas).source(frameOf(4, 3));

	renderer.render();
	assert.deepEqual([canvas.width, canvas.height], [4, 3]);

	renderer.add(new CLARITY.Rotator({ turns: 1 }));
	const out = renderer.render();
	assert.deepEqual([canvas.width, canvas.height], [out.width, out.height]);
});

test('the source with no dimensions yet renders nothing rather than throwing', () => {
	// a video before its metadata has loaded
	const renderer = new CLARITY.Renderer(new StubCanvas(4, 3)).source(new StubCanvas(0, 0));
	assert.equal(renderer.render(), undefined);
});

test('list edits go through to the pipeline', () => {
	const renderer = new CLARITY.Renderer(new StubCanvas(4, 3)).source(frameOf(4, 3));
	const blur = new CLARITY.Blur({ radius: 2 });

	renderer.add(new CLARITY.Invert({})).add(blur);
	assert.equal(renderer.pipeline.length, 2);

	renderer.move(1, 0);
	assert.equal(renderer.pipeline.indexOf(blur), 0);

	renderer.remove(blur);
	assert.equal(renderer.pipeline.length, 1);

	renderer.clear();
	assert.equal(renderer.pipeline.length, 0);
});

test('start and stop drive a frame loop', () => {
	const pending = [];
	globalThis.requestAnimationFrame = (fn) => {
		pending.push(fn);
		return pending.length;
	};
	globalThis.cancelAnimationFrame = () => {};

	try {
		const canvas = new StubCanvas(4, 3);
		const renderer = new CLARITY.Renderer(canvas).source(frameOf(4, 3)).add(new CLARITY.Invert({}));

		assert.equal(renderer.running, false);
		renderer.start();
		assert.equal(renderer.running, true);

		renderer.start();
		assert.equal(pending.length, 1, 'start is idempotent');

		pending.pop()();
		assert.ok(canvas.context.put, 'the tick rendered a frame');

		renderer.stop();
		assert.equal(renderer.running, false);
	} finally {
		delete globalThis.requestAnimationFrame;
		delete globalThis.cancelAnimationFrame;
	}
});

test('onFrame is handed every frame that gets drawn', () => {
	// Without this the only way to do anything per-frame is to abandon `start()`
	// and write the rAF loop again - which the playground did, to read `stats`.
	const seen = [];
	const canvas = new StubCanvas(4, 3);
	const renderer = new CLARITY.Renderer(canvas, { onFrame: (output) => seen.push(output) })
		.source(frameOf(4, 3))
		.add(new CLARITY.Invert({}));

	const output = renderer.render();
	assert.equal(seen.length, 1, 'a one-off render fires it too, not only the loop');
	assert.equal(seen[0], output, 'it gets the frame that was drawn');

	// assignable after construction, since a host may not own the constructor call
	renderer.onFrame = undefined;
	renderer.render();
	assert.equal(seen.length, 1, 'clearing it stops the callbacks');
});

test('onFrame can animate a property, and the change lands on the next frame', () => {
	// The reason to want the hook at all: a property nudged here takes effect on
	// the frame after, which is what a `from → to over N ms` tween amounts to.
	const canvas = new StubCanvas(4, 3);
	const translator = new CLARITY.Translator({ horizontal: 0, vertical: 0 });
	const renderer = new CLARITY.Renderer(canvas).source(frameOf(4, 3)).add(translator);

	renderer.onFrame = () => {
		translator.setProperty('horizontal', translator.getProperty('horizontal') + 0.25);
	};

	renderer.render();
	assert.equal(translator.getProperty('horizontal'), 0.25);
	renderer.render();
	assert.equal(translator.getProperty('horizontal'), 0.5);
});

test('use() swaps the whole chain, second inputs and all', () => {
	// `add` cannot reproduce a chain that arrives whole, because `filters` lists
	// filters without the frames wired alongside them. That is the gap use()
	// fills, so the second input is the part worth asserting.
	const canvas = new StubCanvas(8, 8);
	const renderer = new CLARITY.Renderer(canvas, { gpu: false });
	renderer.source(frameOf(8, 8));

	const before = renderer.render();

	const white = new NodeImageData(8, 8);
	white.data.fill(255);

	const replacement = new CLARITY.Pipeline([], { gpu: false });
	replacement.add(new CLARITY.Multiply(), { second: white });

	renderer.use(replacement);
	assert.equal(renderer.pipeline, replacement, 'the renderer kept its old pipeline');

	const after = renderer.render();

	// multiplying by white is the identity on colour, so this proves the second
	// input arrived rather than merely that something changed: with no second
	// frame the stage would throw or produce black.
	for (let i = 0; i < after.data.length; i += 4) {
		assert.equal(after.data[i], before.data[i], `red differs at ${i}`);
		assert.equal(after.data[i + 1], before.data[i + 1], `green differs at ${i}`);
		assert.equal(after.data[i + 2], before.data[i + 2], `blue differs at ${i}`);
	}
});

test('use() does not dispose the pipeline it replaces', () => {
	// The outgoing chain may be shared, or about to be swapped back in. Both are
	// the caller's business, and a renderer quietly disposing one it was handed
	// would destroy a GL context still in use elsewhere.
	//
	// This needs a pipeline that *owns* a backend, which a CPU-only one does not:
	// with no context to release, dispose() is only a cache clear, and use()
	// invalidates the incoming chain anyway - so the difference is invisible.
	// Standing in for GLBackend.create is the only way to own one in Node.
	let disposed = 0;
	const stub = { lost: false, dispose: () => disposed++ };
	const create = CLARITY.GLBackend.create;
	CLARITY.GLBackend.create = () => stub;

	let owning;
	try {
		owning = new CLARITY.Pipeline([new CLARITY.Invert()]);
		assert.equal(owning.backend, stub, 'the pipeline did not take the stub backend');
	} finally {
		CLARITY.GLBackend.create = create;
	}

	const renderer = new CLARITY.Renderer(new StubCanvas(8, 8), owning);
	renderer.source(frameOf(8, 8));
	renderer.use(new CLARITY.Pipeline([], { gpu: false }));

	assert.equal(disposed, 0, 'use() disposed the pipeline it replaced');
	// and the caller still can, which is the point of leaving it to them
	owning.dispose();
	assert.equal(disposed, 1, 'the owner could not dispose its own backend');
});

test('use() is a no-op on the pipeline already in place', () => {
	// It invalidates the incoming chain, and re-invalidating the current one on
	// every call would quietly turn a repeated `use` into a cache clear.
	const renderer = new CLARITY.Renderer(new StubCanvas(8, 8), { gpu: false });
	renderer.source(frameOf(8, 8));
	renderer.add(new CLARITY.Blur({ radius: 2 }));

	//twice, to reach the steady state - the first render has nothing to skip,
	//so comparing against it would only measure the cold start
	renderer.render();
	renderer.render();

	const before = renderer.stats.skipped;
	assert.ok(before > 0, 'nothing was being cached, so this could not detect a clear');

	renderer.use(renderer.pipeline);
	renderer.render();

	assert.equal(renderer.stats.skipped, before, 'use() on the current pipeline threw the cache away');
});

test('resolution reads the source at a size of its own', () => {
	// The only way to set the size of a generated frame - a chain of starters has
	// no source whose dimensions to inherit - and the cheapest performance
	// control there is, since every filter costs per pixel.
	const canvas = new StubCanvas(8, 8);
	const renderer = new CLARITY.Renderer(canvas, { gpu: false }).source(new StubCanvas(64, 48));

	assert.deepEqual(
		[renderer.render().width, renderer.render().height],
		[64, 48],
		'the natural size should be the default'
	);

	renderer.resolution(16, 12);
	const smaller = renderer.render();
	assert.deepEqual([smaller.width, smaller.height], [16, 12]);

	// and the canvas follows the frame, or the picture would be drawn into a
	// viewport still sized for the old one
	assert.deepEqual([canvas.width, canvas.height], [16, 12]);

	renderer.resolution(null);
	const restored = renderer.render();
	assert.deepEqual([restored.width, restored.height], [64, 48], 'null should mean natural again');
});

test('resolution takes one number for a square', () => {
	const renderer = new CLARITY.Renderer(new StubCanvas(8, 8), { gpu: false })
		.source(new StubCanvas(64, 48))
		.resolution(32);

	const frame = renderer.render();
	assert.deepEqual([frame.width, frame.height], [32, 32]);
});

test('resolution resamples a frame handed over directly', () => {
	// No canvas in the way, so no drawImage to scale through - this is the
	// nearest-neighbour path, which is the honest answer for something that is
	// already pixels.
	const source = new NodeImageData(4, 4);
	for (let i = 0; i < source.data.length; i += 4) {
		source.data.set([255, 0, 0, 255], i);
	}
	//one green pixel, so the resample can be seen to have kept real values
	source.data.set([0, 255, 0, 255], 0);

	const renderer = new CLARITY.Renderer(new StubCanvas(4, 4), { gpu: false })
		.source(source)
		.resolution(8, 8);

	const frame = renderer.render();
	assert.deepEqual([frame.width, frame.height], [8, 8]);

	// nearest, so every pixel is one of the two that were there and nothing was
	// blended into existence between them
	for (let i = 0; i < frame.data.length; i += 4) {
		const pixel = [frame.data[i], frame.data[i + 1], frame.data[i + 2]].join(',');
		assert.ok(
			pixel === '255,0,0' || pixel === '0,255,0',
			`resampling invented ${pixel}, which was in neither picture`
		);
	}
});

test('changing resolution re-reads a still source', () => {
	// A still is read once and the same frame handed over every render, which is
	// what lets the cache hit. That frame is the old size, and so is every stage
	// computed from it.
	const canvas = new StubCanvas(8, 8);
	const renderer = new CLARITY.Renderer(canvas, { gpu: false })
		.source(new StubCanvas(64, 48), { live: false })
		.add(new CLARITY.Invert());

	renderer.render();
	renderer.render();
	assert.equal(canvas.scratchReads, 1, 'a still should be read once');
	assert.equal(renderer.stats.from, -1, 'and then cached');

	renderer.resolution(32, 24);
	renderer.render();
	assert.equal(canvas.scratchReads, 2, 'a new resolution has to re-read the source');
	assert.equal(renderer.stats.from, 0, 'and recompute the chain');

	// setting the same resolution again is not a change, so it must not
	// invalidate - a UI writing the current value back on every keystroke would
	// otherwise never let the cache hit
	renderer.render();
	renderer.resolution(32, 24);
	renderer.render();
	assert.equal(renderer.stats.from, -1, 'setting the same resolution threw the cache away');
});
