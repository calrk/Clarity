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

/** Fills the alpha channel, for filters whose loops skip a border. */
export function fillAlpha(frame: ImageData, alpha = 255): void {
	for (let i = 3; i < frame.data.length; i += 4) {
		frame.data[i] = alpha;
	}
}
