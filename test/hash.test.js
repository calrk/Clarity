// The hashed randomness exists so that the CPU and the GPU can produce the
// *same* noise, not merely noise with the same statistics. That only works if
// the JavaScript and the GLSL are doing identical 32-bit integer arithmetic, so
// these pin the JS half; test/gpu-parity.test.js compares it against the
// shader for real.
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

function frame(width = 12, height = 9) {
	const f = new NodeImageData(width, height);
	for (let i = 0; i < f.data.length; i += 4) f.data.set([100, 120, 140, 255], i);
	return f;
}

test('the hash stays inside 32 bits and is uniform enough to be noise', () => {
	const seen = new Set();
	let sum = 0;
	const draws = 4096;

	for (let i = 0; i < draws; i++) {
		const value = CLARITY.hashedRandom(i % 64, Math.floor(i / 64), 0, 7);
		assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
		seen.add(value);
		sum += value;
	}

	// a hash that collapsed - a bad multiply, a lost >>> 0 - would show up here
	// long before anyone noticed the picture looked wrong
	assert.ok(seen.size > draws * 0.99, `only ${seen.size} distinct values from ${draws}`);
	assert.ok(Math.abs(sum / draws - 0.5) < 0.02, `mean ${sum / draws} is not near 0.5`);
});

test('the same coordinates always hash to the same value', () => {
	assert.equal(CLARITY.hashedRandom(3, 4, 1, 99), CLARITY.hashedRandom(3, 4, 1, 99));
	assert.notEqual(CLARITY.hashedRandom(3, 4, 1, 99), CLARITY.hashedRandom(4, 3, 1, 99));
	assert.notEqual(CLARITY.hashedRandom(3, 4, 1, 99), CLARITY.hashedRandom(3, 4, 2, 99));
	assert.notEqual(CLARITY.hashedRandom(3, 4, 1, 99), CLARITY.hashedRandom(3, 4, 1, 98));
});

test('a seeded source still reproduces a frame exactly', () => {
	const bytes = (f) => [...f.data];
	const a = new CLARITY.Noise({ intensity: 40, random: CLARITY.seededRandom(5) });
	const b = new CLARITY.Noise({ intensity: 40, random: CLARITY.seededRandom(5) });

	assert.deepEqual(bytes(a.process(frame())), bytes(b.process(frame())));
});

test('successive frames get different noise', () => {
	// one draw per frame becomes the seed, so the grain still moves
	const noise = new CLARITY.Noise({ intensity: 40, random: CLARITY.seededRandom(5) });
	const first = [...noise.process(frame()).data];
	const second = [...noise.process(frame()).data];

	assert.notDeepEqual(first, second);
});
