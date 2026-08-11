import { Pipeline } from './Pipeline.js';
import type { Filter } from './Filter.js';
import type { PipelineStats, StageOptions } from './Pipeline.js';

/**
 * Anything a {@link Renderer} can pull a frame from. A function is the escape
 * hatch for everything not listed - a WebGL context, an OffscreenCanvas, a
 * frame decoded somewhere else.
 */
export type RenderSource =
	| ImageData
	| HTMLImageElement
	| HTMLVideoElement
	| HTMLCanvasElement
	| ImageBitmap
	| (() => ImageData);

export interface RendererOptions {
	/** Use shaders where possible. Defaults to true. */
	gpu?: boolean;
	/**
	 * Called after every frame the renderer draws, with what it drew.
	 *
	 * Without this, wanting to do anything per-frame means abandoning
	 * {@link Renderer.start} and writing the `requestAnimationFrame` loop again -
	 * which the playground did, comment and all, purely to read `stats` after
	 * each frame. Two things want it: reading the stats, and animating a
	 * property, which is a `setProperty` here that takes effect on the next
	 * frame.
	 *
	 * It fires on every `render()`, not only inside the loop, so a one-off frame
	 * and a looped one are not different cases to the caller.
	 */
	onFrame?: (output: ImageData) => void;
}

export interface SourceOptions {
	/**
	 * Whether the source produces a new frame every time it is read.
	 *
	 * This is what decides whether the pipeline cache can do anything: a still
	 * image read once hands the same frame over every render, so an unchanged
	 * chain costs nothing. Defaults to true for video and canvas, false for
	 * everything else.
	 */
	live?: boolean;
}

/**
 * Owns a canvas, a source, a {@link Pipeline} and the frame loop.
 *
 * This is the browser half. Every example used to hand-roll the same four
 * lines - `getImageData`, loop over the filters, `putImageData` - along with its
 * own reordering and list-building code, copy-pasted across seven files.
 *
 * ```js
 * const renderer = new Renderer(canvas)
 *   .source(video)
 *   .add(new Blur({ radius: 8 }))
 *   .add(new EdgeDetector());
 *
 * renderer.start();
 * ```
 */
export class Renderer {
	readonly canvas: HTMLCanvasElement;
	/** The chain being rendered. Swap the whole thing with {@link use}. */
	pipeline: Pipeline;

	private context: CanvasRenderingContext2D;
	/** Scratch canvas the source is drawn into before being read back. */
	private scratch: HTMLCanvasElement | undefined;
	private input: RenderSource | undefined;
	private live = false;
	/** Last frame read from the source, reused while the source is not live. */
	private frame: ImageData | undefined;
	private handle = 0;

	/**
	 * Takes either a ready-made {@link Pipeline} to share, or options for one to
	 * be built. The default pipeline uses the GPU where it can.
	 */
	constructor(canvas: HTMLCanvasElement, pipeline: Pipeline | RendererOptions = {}) {
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Renderer needs a 2d context');
		}

		this.canvas = canvas;
		this.context = context;
		this.pipeline =
			pipeline instanceof Pipeline ? pipeline : new Pipeline([], { gpu: pipeline.gpu });
		this.onFrame = pipeline instanceof Pipeline ? undefined : pipeline.onFrame;
	}

	/**
	 * Called with each frame drawn. Assignable, so it can be attached after
	 * construction or swapped out. See {@link RendererOptions.onFrame}.
	 */
	onFrame: ((output: ImageData) => void) | undefined;

	/** Whether the chain is running as shaders. */
	get usingGPU(): boolean {
		return this.pipeline.usingGPU;
	}

	/** Whether shaders are wanted. Switching invalidates the cache. */
	get gpu(): boolean {
		return this.pipeline.gpu;
	}

	set gpu(wanted: boolean) {
		this.pipeline.gpu = wanted;
	}

	/** Where the last render's time went. */
	get stats(): PipelineStats {
		return this.pipeline.stats;
	}

	/**
	 * The frame most recently read from the source, before any filter ran.
	 *
	 * Reading a video or an image element means drawing it into a scratch canvas
	 * and pulling the pixels back, which is not something a caller should have to
	 * repeat to get at the same bytes - a two-input filter masking against the
	 * unfiltered source needs exactly this, and so does anything benchmarking the
	 * chain against a fixed frame.
	 */
	get sourceFrame(): ImageData | undefined {
		return this.frame;
	}

	get running(): boolean {
		return this.handle !== 0;
	}

	/**
	 * Renders a different chain from now on, keeping the source and the loop.
	 *
	 * The methods above edit the chain in place, which is the right shape for a
	 * UI where a chain is *assembled*. It is the wrong shape for one where a
	 * chain arrives whole - built by a caller, or returned from a snippet - and
	 * there was no way to hand one over: `add` cannot reproduce a stage's second
	 * input, because {@link Pipeline.filters} lists filters and not the frames
	 * wired alongside them.
	 *
	 * The old pipeline is **not** disposed. It may be shared, and it may be
	 * about to be swapped back in; both are the caller's business. What is
	 * disposed of here is only the cached frames of the incoming one, since it
	 * has not seen this source.
	 */
	use(pipeline: Pipeline): this {
		if (pipeline === this.pipeline) {
			return this;
		}

		this.pipeline = pipeline;
		//It may have run against something else entirely, and it has certainly
		//never seen this source object.
		pipeline.invalidate();
		return this;
	}

	source(input: RenderSource, options: SourceOptions = {}): this {
		this.input = input;
		this.live = options.live ?? isLive(input);
		this.frame = undefined;

		//a new source invalidates every cached stage, not just the first
		this.pipeline.invalidate();
		return this;
	}

	/** Forces the next render to re-read the source. */
	invalidateSource(): this {
		this.frame = undefined;
		return this;
	}

	add(filter: Filter, options?: StageOptions): this {
		this.pipeline.add(filter, options);
		return this;
	}

	insert(index: number, filter: Filter, options?: StageOptions): this {
		this.pipeline.insert(index, filter, options);
		return this;
	}

	remove(target: Filter | number): this {
		this.pipeline.remove(target);
		return this;
	}

	move(from: number, to: number): this {
		this.pipeline.move(from, to);
		return this;
	}

	clear(): this {
		this.pipeline.clear();
		return this;
	}

	/** Renders one frame. Returns the result, or undefined with no source. */
	render(): ImageData | undefined {
		const frame = this.readSource();
		if (!frame) {
			return undefined;
		}

		const output = this.pipeline.run(frame);

		//A filter is free to change the frame size - Rotator on a non-square
		//image does. Resizing the canvas clears it, so only touch it when it
		//actually differs.
		if (this.canvas.width !== output.width || this.canvas.height !== output.height) {
			this.canvas.width = output.width;
			this.canvas.height = output.height;
		}

		this.context.putImageData(output, 0, 0);
		this.onFrame?.(output);
		return output;
	}

	/** Starts a requestAnimationFrame loop. Idempotent. */
	start(): this {
		if (this.handle !== 0) {
			return this;
		}

		const tick = () => {
			this.handle = requestAnimationFrame(tick);
			this.render();
		};
		this.handle = requestAnimationFrame(tick);
		return this;
	}

	stop(): this {
		if (this.handle !== 0) {
			cancelAnimationFrame(this.handle);
			this.handle = 0;
		}
		return this;
	}

	/**
	 * Reads a frame from the source.
	 *
	 * A non-live source is read once and the *same* ImageData handed over on
	 * every subsequent render, which is what lets the pipeline recognise that
	 * nothing has changed. Re-reading would produce an equal-but-different
	 * object and defeat the cache entirely.
	 */
	private readSource(): ImageData | undefined {
		if (!this.input) {
			return undefined;
		}
		if (!this.live && this.frame) {
			return this.frame;
		}

		if (typeof this.input === 'function') {
			this.frame = this.input();
			return this.frame;
		}
		if (isFrame(this.input)) {
			this.frame = this.input;
			return this.frame;
		}

		const size = sizeOf(this.input);
		if (!size.width || !size.height) {
			return undefined;	//a video with no metadata yet, or an image still loading
		}

		this.scratch ??= this.canvas.ownerDocument.createElement('canvas');
		if (this.scratch.width !== size.width || this.scratch.height !== size.height) {
			this.scratch.width = size.width;
			this.scratch.height = size.height;
		}

		const scratchContext = this.scratch.getContext('2d', { willReadFrequently: true });
		if (!scratchContext) {
			return undefined;
		}

		scratchContext.drawImage(this.input, 0, 0, size.width, size.height);
		this.frame = scratchContext.getImageData(0, 0, size.width, size.height);
		return this.frame;
	}
}

/**
 * Duck-typed rather than `instanceof ImageData`, for two reasons. `ImageData`
 * does not exist in Node, so the bare `instanceof` was a ReferenceError rather
 * than a false - and the whole point of `setImageDataFactory` is that a caller
 * can supply their own ImageData-alike, which would fail an identity check.
 */
function isFrame(input: unknown): input is ImageData {
	return (
		typeof input === 'object' &&
		input !== null &&
		'data' in input &&
		ArrayBuffer.isView((input as ImageData).data)
	);
}

/** Same defensiveness: every DOM global here may simply not exist. */
function isInstance(input: unknown, name: string): boolean {
	const constructor = (globalThis as Record<string, unknown>)[name];
	return typeof constructor === 'function' && input instanceof (constructor as Function);
}

function isLive(input: RenderSource): boolean {
	if (typeof input === 'function') {
		return true;
	}
	//A video obviously produces new frames; a canvas is usually something else
	//drawing into it, which is the case in the WebGL examples.
	return isInstance(input, 'HTMLVideoElement') || isInstance(input, 'HTMLCanvasElement');
}

function sizeOf(input: Exclude<RenderSource, ImageData | (() => ImageData)>): {
	width: number;
	height: number;
} {
	if (isInstance(input, 'HTMLVideoElement')) {
		const video = input as HTMLVideoElement;
		return { width: video.videoWidth, height: video.videoHeight };
	}
	if (isInstance(input, 'HTMLImageElement')) {
		const image = input as HTMLImageElement;
		return { width: image.naturalWidth, height: image.naturalHeight };
	}
	return { width: input.width, height: input.height };
}
