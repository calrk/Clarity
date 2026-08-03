/**
 * Filter an `<img>` in place.
 *
 *     <img src="/sprite.png" use:clarity={'Desaturate/Noise,intensity=20'} />
 *
 * The element keeps its identity - same `<img>`, same CSS, same `alt` - and
 * only its `src` changes. The original is kept on `data-clarity-source`, so
 * the effect can be reverted, re-run against the untouched original when the
 * chain changes, and read back by anything else on the page.
 *
 * This is the one part of Clarity that touches the DOM, which is why it is a
 * separate entry point: `@calrk/clarity` stays importable in Node, and nothing
 * that imports it pays for this.
 *
 * It follows Svelte's action contract - `(node, params) => { update, destroy }`
 * - but it is a plain function with no Svelte import, so it works in Svelte 4
 * and 5, and standalone:
 *
 *     const handle = clarity(document.querySelector('img'), 'Blur,radius=8');
 *     handle.update('Invert');
 *     handle.destroy();
 */

//by package name rather than by relative path, so the built adapter *imports*
//the library instead of bundling a second copy of it
import { GLBackend, Pipeline, buildChain } from '@calrk/clarity';

export interface ClarityParams {
	/** The chain, in the `Blur,radius=8/Invert` format. */
	chain?: string;
	/** Skip processing without unmounting the action. Restores the original. */
	enabled?: boolean;
	/**
	 * Hide the element until the filtered result is ready.
	 *
	 * There is always a gap: the image has to load before a single pixel can be
	 * read, so the original is briefly visible. For a subtle filter that is
	 * fine; for `Invert` it is a flash of the wrong picture.
	 */
	hide?: boolean;
	/**
	 * Crossorigin mode for images from another origin.
	 *
	 * Reading pixels from a cross-origin image taints the canvas and every
	 * subsequent read throws - which is the single most likely way this fails in
	 * a real app, since game assets usually live on a CDN. The image must be
	 * fetched with CORS *and* the server must allow it; this sets the first
	 * half, and the error message says so when the second half is missing.
	 */
	crossOrigin?: 'anonymous' | 'use-credentials';
	/** Called with the error when processing fails. The original is restored. */
	onError?: (error: Error) => void;
}

export type ClaritySpec = string | ClarityParams;

export interface ClarityHandle {
	update(spec: ClaritySpec): void;
	destroy(): void;
}

const SOURCE_ATTRIBUTE = 'claritySource';

/**
 * One GL context for every element on the page.
 *
 * A browser will hand out somewhere around sixteen WebGL contexts and then
 * start dropping the oldest, so a context per `<img>` breaks silently as soon
 * as a page has a few sprites on it. Created on first use and shared; if it
 * cannot be had at all, every pipeline falls back to the CPU on its own.
 */
let shared: GLBackend | null = null;
let triedShared = false;

function backend(): GLBackend | null {
	if (!triedShared) {
		triedShared = true;
		shared = GLBackend.create();
	}
	return shared?.lost ? null : shared;
}

/** Releases the shared context. Only needed in tests and hot-reload. */
export function disposeSharedBackend(): void {
	shared?.dispose();
	shared = null;
	triedShared = false;
}

function normalise(spec: ClaritySpec): Required<Pick<ClarityParams, 'chain' | 'enabled' | 'hide'>> & ClarityParams {
	const params = typeof spec === 'string' ? { chain: spec } : spec;
	return {
		chain: params.chain ?? '',
		enabled: params.enabled !== false,
		hide: params.hide === true,
		...params
	};
}

export function clarity(node: HTMLImageElement, spec: ClaritySpec = ''): ClarityHandle {
	let params = normalise(spec);
	let objectUrl: string | null = null;
	//every run gets a token; a slow one that finishes after a newer one started
	//must not overwrite it
	let generation = 0;
	let destroyed = false;

	//captured once, before anything is replaced, so re-running always starts
	//from the untouched original rather than from the last result
	node.dataset[SOURCE_ATTRIBUTE] ??= node.currentSrc || node.src;

	function releaseUrl() {
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = null;
		}
	}

	function restore() {
		const original = node.dataset[SOURCE_ATTRIBUTE];
		if (original && node.src !== original) {
			node.src = original;
		}
		releaseUrl();
		node.style.visibility = '';
	}

	function fail(error: Error) {
		restore();
		if (params.onError) {
			params.onError(error);
		} else {
			console.warn(`clarity: ${error.message}`, node);
		}
	}

	async function run() {
		const mine = ++generation;
		const original = node.dataset[SOURCE_ATTRIBUTE];

		if (!params.enabled || !params.chain.trim() || !original) {
			restore();
			return;
		}
		if (params.hide) {
			node.style.visibility = 'hidden';
		}

		try {
			const source = await loadOriginal(original, params.crossOrigin);
			if (destroyed || mine !== generation) {
				return;
			}

			const frame = readPixels(source);
			const pipeline = new Pipeline(buildChain(params.chain), { backend: backend() });
			const output = pipeline.run(frame);

			const blob = await toBlob(output);
			if (destroyed || mine !== generation) {
				return;
			}

			//the previous result is only released once the new one exists, so the
			//element is never pointed at a revoked URL
			const previous = objectUrl;
			objectUrl = URL.createObjectURL(blob);
			node.src = objectUrl;
			if (previous) {
				URL.revokeObjectURL(previous);
			}
			node.style.visibility = '';
		} catch (error) {
			if (!destroyed && mine === generation) {
				fail(error instanceof Error ? error : new Error(String(error)));
			}
		}
	}

	run();

	return {
		update(next: ClaritySpec) {
			params = normalise(next);
			run();
		},
		destroy() {
			destroyed = true;
			restore();
			delete node.dataset[SOURCE_ATTRIBUTE];
		}
	};
}

function loadOriginal(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		if (crossOrigin) {
			image.crossOrigin = crossOrigin;
		}
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`could not load ${src}`));
		image.src = src;
	});
}

function readPixels(image: HTMLImageElement): ImageData {
	const canvas = document.createElement('canvas');
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;

	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) {
		throw new Error('no 2d context');
	}
	context.drawImage(image, 0, 0);

	try {
		return context.getImageData(0, 0, canvas.width, canvas.height);
	} catch {
		throw new Error(
			'the image is cross-origin, so its pixels cannot be read. ' +
				'It needs crossOrigin set here and an Access-Control-Allow-Origin header from the server.'
		);
	}
}

/**
 * A blob rather than a data URL.
 *
 * `toDataURL` returns base64 in a string, which then lives in the DOM as an
 * attribute - a 2MB sprite becomes a ~2.7MB `src` that has to be re-encoded
 * every time the chain changes. A blob URL is a short reference to bytes the
 * browser already holds, and it can be revoked.
 */
function toBlob(frame: ImageData): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = frame.width;
	canvas.height = frame.height;
	canvas.getContext('2d')!.putImageData(frame, 0, 0);

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			blob ? resolve(blob) : reject(new Error('could not encode the result'));
		}, 'image/png');
	});
}
