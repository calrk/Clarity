/**
 * A hash of a coordinate, standing in for a stream of random numbers.
 *
 * A fragment shader has no random source: fragments run in an undefined order,
 * so there is nothing to draw from in sequence. The GPU answer is to hash the
 * pixel's own coordinates, and because the CPU is the reference implementation
 * that both paths are compared against, it has to do the same thing - otherwise
 * `Noise` and `Cloud` produce visibly different grain on the two backends and
 * can never be compared at all.
 *
 * Everything here is 32-bit integer arithmetic, so JavaScript and GLSL agree
 * exactly rather than approximately. `Math.imul` is a 32-bit multiply with
 * wraparound, which is what GLSL's `uint` multiply also is; the shader twin
 * lives in `src/gpu/glsl.ts` and must be kept in step with this.
 *
 * Randomness is still injectable and still reproducible: the filter draws one
 * value per frame from its `RandomSource` and that becomes the seed, so
 * `seededRandom` controls the output exactly as before.
 */

/** Chris Wellons' lowbias32 finaliser. */
export function hash32(value: number): number {
	let h = value >>> 0;
	h ^= h >>> 16;
	h = Math.imul(h, 0x7feb352d);
	h ^= h >>> 15;
	h = Math.imul(h, 0x846ca68b);
	h ^= h >>> 16;
	return h >>> 0;
}

/** Mixes a position, a lane (channel or octave) and the frame's seed. */
function mix(x: number, y: number, lane: number, seed: number): number {
	return (
		Math.imul(x, 0x9e3779b9) ^
		Math.imul(y, 0x85ebca6b) ^
		Math.imul(lane + 1, 0xc2b2ae35) ^
		seed
	) >>> 0;
}

/**
 * 0..1, uniform.
 *
 * 24 bits rather than 32: a float32 cannot hold a 32-bit integer exactly, so a
 * shader dividing the full hash by 2^32 would round the low bits away and stop
 * matching. 24 bits is exactly representable on both sides.
 */
export function hashedRandom(x: number, y: number, lane: number, seed: number): number {
	return (hash32(mix(x, y, lane, seed)) >>> 8) / 16777216;
}

/** 0..255, uniform - the top byte, so no float is involved at all. */
export function hashedByte(x: number, y: number, lane: number, seed: number): number {
	return hash32(mix(x, y, lane, seed)) >>> 24;
}

/**
 * One draw from a filter's random source, as an integer a shader can take as a
 * uniform. 24 bits, for the reason above.
 */
export function seedFrom(random: () => number): number {
	return Math.floor(random() * 16777216);
}
