/**
 * Allocates a blank ImageData.
 *
 * Clarity used to hold a module-level `CLARITY.ctx`, created by calling
 * `document.createElement('canvas').getContext('2d')` at import time purely to
 * borrow its `createImageData`. That made the library impossible to import
 * anywhere without a DOM - no Node, no SSR, no headless tests - for a helper the
 * platform has provided directly for years.
 *
 * The `new ImageData()` constructor is available in browsers, Workers and Node
 * 18+. The canvas fallback only runs where it genuinely isn't.
 */

let fallbackContext: CanvasRenderingContext2D | null | undefined;
let factory: ((width: number, height: number) => ImageData) | null = null;

/**
 * Supplies the ImageData constructor for environments that lack one.
 *
 * Node has no global `ImageData`, so headless callers (tests, build-time texture
 * generation) must either install a polyfill or hand Clarity a factory here.
 * Pass `null` to go back to the built-in detection.
 */
export function setImageDataFactory(
	fn: ((width: number, height: number) => ImageData) | null
): void {
	factory = fn;
}

export function createImageData(width: number, height: number): ImageData {
	if (factory) {
		return factory(width, height);
	}

	if (typeof ImageData === 'function') {
		return new ImageData(width, height);
	}

	if (fallbackContext === undefined) {
		fallbackContext =
			typeof document === 'undefined'
				? null
				: document.createElement('canvas').getContext('2d');
	}

	if (!fallbackContext) {
		throw new Error(
			'Clarity: no ImageData available. Install a polyfill or call ' +
				'setImageDataFactory() with one.'
		);
	}

	return fallbackContext.createImageData(width, height);
}

/** Allocates an ImageData the same size as `frame`, with its pixels copied in. */
export function cloneImageData(frame: ImageData): ImageData {
	const copy = createImageData(frame.width, frame.height);
	copy.data.set(frame.data);
	return copy;
}

/**
 * `frame` at a different size, by nearest neighbour - or `frame` itself when it
 * is already that size, which is the case worth being free.
 *
 * This exists for the second input of a two-input filter, where the two frames
 * are two different pictures and nothing makes them agree about size. The two
 * backends disagreed about what that meant, and neither was defensible:
 *
 * - The CPU walks the second frame by byte offset, so a frame of a different
 *   width is read a row at a time out of alignment. A smaller one runs off the
 *   end and returns undefined, which lands in a Uint8ClampedArray as 0 - two
 *   pure white frames multiplied together came out three quarters black.
 * - The shader samples it by normalised uv, so it *stretches* to fit, which is
 *   the answer someone compositing two pictures actually wants.
 *
 * Resampling here rather than teaching six filters to do it means there is one
 * implementation instead of two that have to agree, and the shader ends up
 * sampling a texture that already matches it one to one.
 *
 * Nearest rather than bilinear, and at texel centres, because that is what the
 * GPU path was already doing - `makeTexture` is NEAREST throughout, for the
 * reason given there: linear filtering blends neighbours into results the CPU
 * computes exactly. Scaling a mask should not invent values that are in neither
 * picture.
 */
export function resampleTo(frame: ImageData, width: number, height: number): ImageData {
	if (frame.width === width && frame.height === height) {
		return frame;
	}

	const out = createImageData(width, height);

	//the column map is the same for every row, so it is worth doing once
	const columns = new Int32Array(width);
	for (let x = 0; x < width; x++) {
		columns[x] = Math.min(frame.width - 1, Math.floor(((x + 0.5) / width) * frame.width));
	}

	for (let y = 0; y < height; y++) {
		const row = Math.min(frame.height - 1, Math.floor(((y + 0.5) / height) * frame.height));
		const from = row * frame.width;

		for (let x = 0; x < width; x++) {
			const source = (from + columns[x]) * 4;
			const target = (y * width + x) * 4;

			out.data[target] = frame.data[source];
			out.data[target + 1] = frame.data[source + 1];
			out.data[target + 2] = frame.data[source + 2];
			out.data[target + 3] = frame.data[source + 3];
		}
	}

	return out;
}

/** Fills the alpha channel, for filters whose loops skip a border. */
export function fillAlpha(frame: ImageData, alpha = 255): void {
	for (let i = 3; i < frame.data.length; i += 4) {
		frame.data[i] = alpha;
	}
}
