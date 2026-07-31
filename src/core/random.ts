/** A source of numbers in [0, 1), matching `Math.random`'s contract. */
export type RandomSource = () => number;

/** A monotonic millisecond clock, matching `performance.now`'s contract. */
export type Clock = () => number;

/**
 * Seeded PRNG (mulberry32). Small, fast and deterministic - enough for filter
 * noise, and what makes the golden-image tests in FEATURES.md #6 possible.
 *
 * Not cryptographically secure, and not meant to be.
 */
export function seededRandom(seed: number): RandomSource {
	let state = seed >>> 0;

	return function next(): number {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The default clock: `performance.now` where it exists, otherwise `Date.now`. */
export const defaultClock: Clock =
	typeof performance !== 'undefined' && typeof performance.now === 'function'
		? () => performance.now()
		: () => Date.now();
