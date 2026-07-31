// Shared machinery for running a golden case, used by both the CPU golden test
// and (once #3 lands) the GPU parity test.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as CLARITY from '../../dist/clarity.js';
import { NodeImageData, readPNG } from './image.js';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = join(here, '..', 'fixtures');
export const GOLDEN = join(here, '..', 'golden');
export const OUTPUT = join(here, '..', 'output');

CLARITY.setImageDataFactory((w, h) => new NodeImageData(w, h));

const cache = new Map();

export function fixture(name) {
	if (!cache.has(name)) {
		cache.set(name, readPNG(join(FIXTURES, `${name}.png`)));
	}
	// hand out a copy: filters are allowed to mutate their input, and a
	// shared fixture would leak state between cases
	const source = cache.get(name);
	const copy = new NodeImageData(source.width, source.height);
	copy.data.set(source.data);
	return copy;
}

/**
 * Builds the filter for a case, wiring up deterministic randomness and time.
 * Kept separate from `runCase` so the GPU harness can construct the same
 * filter with a different backend.
 */
export function buildFilter(entry) {
	const options = { ...entry.options };

	if (entry.seed !== undefined) {
		options.random = CLARITY.seededRandom(entry.seed);
	}
	if (entry.now !== undefined) {
		options.now = () => entry.now;
	}

	const Ctor = CLARITY[entry.filter];
	if (typeof Ctor !== 'function') {
		throw new Error(`unknown filter "${entry.filter}"`);
	}
	return new Ctor(options);
}

/**
 * Runs a case and returns the resulting ImageData.
 *
 * Three input shapes:
 *  - a single fixture name              -> process(frame)
 *  - two names, `sequence` unset        -> process([a, b]), the dual-input form
 *  - two names, `sequence: true`        -> process(a) then process(b), for the
 *                                          stateful filters whose output
 *                                          depends on frames already seen
 */
export function runCase(entry, filter = buildFilter(entry)) {
	if (Array.isArray(entry.input)) {
		if (entry.sequence) {
			let out;
			for (const name of entry.input) {
				out = filter.process(fixture(name));
			}
			return out;
		}
		return filter.process(entry.input.map(fixture));
	}

	return filter.process(fixture(entry.input));
}
