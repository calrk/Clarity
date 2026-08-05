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
