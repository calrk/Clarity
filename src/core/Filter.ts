import { defaultClock } from './random.js';
import { seedFrom } from '../helpers/hash.js';
import { resampleTo } from './imagedata.js';
import { coerceValue } from './schema.js';
import type { Clock, RandomSource } from './random.js';
import type { FilterSchema, PropertyValue } from './schema.js';
import type { FilterData, RetainedFrames, ShaderDefinition } from '../gpu/GLBackend.js';

/** Channel selectors accepted by `getColourValue`. */
export type Channel =
	| 'grey'
	| 'red' | 'r'
	| 'green' | 'g'
	| 'blue' | 'b';

export interface FilterOptions {
	/** Which channel single-channel filters read. Defaults to `'grey'`. */
	channel?: Channel;
	/** Start disabled - `process` then passes the frame straight through. */
	enabled?: boolean;
	/**
	 * Randomness source for filters that need it. Defaults to `Math.random`.
	 * Pass {@link seededRandom} to make output reproducible.
	 */
	random?: RandomSource;
	/**
	 * Clock for time-varying filters. Defaults to `performance.now`. Pass a
	 * fixed function to freeze animation for a screenshot or a test.
	 */
	now?: Clock;
}

/**
 * A filter's tweakable values. Each concrete filter narrows this.
 * `null` is allowed because a few filters use it for "derive this from the
 * frame" - ValueThreshold's auto threshold, for instance.
 */
export type FilterProperties = Record<string, PropertyValue>;

/**
 * Base class for every filter.
 *
 * Subclasses implement `doProcess`; `process` handles the enabled check and
 * unpacks the two-frame form used by the DualInput filters.
 */
export class Filter {
	/**
	 * What this filter's properties are and what values they accept.
	 *
	 * Declared per subclass; see `src/core/schema.ts` for why this lives in the
	 * library rather than in whatever is drawing the controls. The base class
	 * has none, so a filter with no options needs no schema and a host app gets
	 * an empty object rather than a special case.
	 */
	static schema: FilterSchema = {};

	/**
	 * Output depends on frames this filter has already seen, not just the one
	 * being handed to it - `Ghoster`'s trail, `MotionDetector`'s ring,
	 * `DifferenceDetector`'s reference frame.
	 *
	 * A stateful filter must see every frame, in order, exactly once. A
	 * {@link Pipeline} therefore can neither cache it nor skip it, and #3 has to
	 * give it a retained previous-frame texture rather than a plain ping-pong.
	 */
	static stateful = false;

	/**
	 * Output changes between calls on identical input, because the filter reads
	 * the clock or the random source - `Wave`, `Noise`, `Cloud`.
	 *
	 * Same practical consequence as {@link stateful} for caching, but a
	 * different cause, and the difference matters to the GPU backend: varying
	 * filters need a time or seed uniform, stateful ones need storage.
	 */
	static varying = false;

	/**
	 * Whether this filter is a pure function of its input frame and properties,
	 * and so may be cached. Derived - declare `stateful` or `varying` instead.
	 */
	static get pure(): boolean {
		return !this.stateful && !this.varying;
	}

	/**
	 * Whether this filter will draw something *different* if asked again later,
	 * with nothing else having changed - which is what a host needs to decide
	 * whether to run a frame loop over a still image.
	 *
	 * Deliberately not the same question as {@link pure}. Purity is about
	 * caching: "may I reuse the last output". This is about time: "will waiting
	 * produce a new one". A `Wave` parked at `speed = 0` is impure - its output
	 * is not a function of its input alone - and yet it will draw the same frame
	 * forever, so a loop is wasted on it. Answering the caching question here
	 * kept the loop running for filters that had nothing left to show.
	 *
	 * Per instance, like `retains` and `supportsGPU`, because the answer usually
	 * turns on one property.
	 */
	static animated(_filter: Filter): boolean {
		return this.varying;
	}

	/**
	 * GLSL for the GPU path: either one fragment shader body, or a list of
	 * passes for the filters that need more than one draw.
	 *
	 * Compiled against the prelude in `src/gpu/glsl.ts`, which supplies `uSrc`,
	 * the frame size, the channel selector and one `u_<key>` uniform per schema
	 * property - so a shader is the operation itself rather than a wall of
	 * boilerplate. `null` means CPU only.
	 *
	 * The CPU implementation stays the reference. It is the oracle the parity
	 * tests compare against and the fallback where WebGL2 is missing, so a
	 * filter is not finished until both exist and agree.
	 */
	static shader: ShaderDefinition | null = null;

	/**
	 * Whether the shader covers the filter's *current* options.
	 *
	 * Several filters are pointwise in one mode and a whole-image reduction in
	 * another - `Invert`'s dynamic mode needs the frame's min and max,
	 * `ValueThreshold`'s auto mode derives its threshold from the histogram.
	 * Rather than losing the whole filter to the CPU, the shader covers the
	 * common case and this says when it applies.
	 */
	static supportsGPU(_filter: Filter): boolean {
		return true;
	}

	/**
	 * The size this filter's output will be, given an input size.
	 *
	 * Almost every filter hands back a frame the size it was given, which is the
	 * default. `Rotator` is the exception: a quarter turn of a 640x480 frame is
	 * 480x640, and the GPU executor has to know that before it allocates the
	 * target to render into. The CPU path works it out for itself when it
	 * allocates the output.
	 */
	static outputSize(_filter: Filter, width: number, height: number): { width: number; height: number } {
		return { width, height };
	}

	/**
	 * Per-instance data the shader needs that will not fit in a uniform.
	 *
	 * A uniform is a scalar, and one filter carries an array: `Puzzler`'s tile
	 * shuffle. Returning a small RGBA8 block here uploads it to `uData`, which
	 * the shader reads with `dataValue(x, y)`. Called every frame rather than
	 * cached, because the shuffle changes on a click as well as on a property
	 * change - it is a few hundred bytes, so there is nothing to save.
	 */
	static data(_filter: Filter): FilterData | null {
		return null;
	}

	/**
	 * Previous frames this filter needs kept for it on the GPU.
	 *
	 * The ping-pong pair cannot express a history: it holds the frame coming in
	 * and the frame going out, and nothing else. A `stateful` filter that
	 * declares this gets a `sampler2DArray` of retained frames instead, read in
	 * the shader with `historyTexel(age, p)` - age 0 being the frame currently
	 * being processed.
	 *
	 * Storage is per filter instance and is thrown away whenever
	 * {@link reset} is called, which is what keeps the two backends from
	 * blending histories that have diverged.
	 */
	static retains(_filter: Filter): RetainedFrames | null {
		return null;
	}

	/**
	 * Longest edge of the downscaled copy this filter wants before it runs, or 0
	 * for none.
	 *
	 * For filters that have to look at the whole image before they can process a
	 * pixel and whose answer is not a min, a max or anything else a pyramid can
	 * reduce. `Posteriser`'s median cut is the one: it builds a palette, which is
	 * a sequential algorithm on pixels that live in a texture. Sampling small is
	 * what keeps that from being a full frame readback every frame.
	 */
	static samples = 0;

	/**
	 * Handed the sample described by {@link samples}, before the shader runs.
	 *
	 * The CPU path calls this too, from `doProcess`, so the two backends derive
	 * whatever this computes from exactly the same pixels.
	 */
	static prepare(_filter: Filter, _sample: ImageData): void {}

	channel: Channel;
	properties: FilterProperties = {};

	private _enabled = true;

	/**
	 * Bypasses the filter without removing it from the chain.
	 *
	 * An accessor rather than a plain field so that toggling it marks the filter
	 * dirty. Host apps assign to this directly - the example control panel does
	 * - and a bypass that didn't invalidate the cache would show a stale frame.
	 */
	get enabled(): boolean {
		return this._enabled;
	}

	set enabled(value: boolean) {
		if (value !== this._enabled) {
			this._enabled = value;
			this.dirty = true;
		}
	}

	/**
	 * Set whenever a property changes, so a {@link Pipeline} can reuse the
	 * cached output of any stage upstream of the first dirty one. Cleared by the
	 * pipeline once the filter has been re-run.
	 */
	dirty = true;

	/**
	 * Bumped by {@link reset}, so the GPU backend can tell that the retained
	 * frames it is holding for this filter are no longer valid.
	 */
	historyEpoch = 0;

	/** Injectable so filter output can be made reproducible - see FEATURES.md #6. */
	random: RandomSource;
	now: Clock;

	/**
	 * Drawn once, on first use, rather than once per frame. See {@link seed}.
	 *
	 * Lazy rather than drawn in the constructor, because drawing eagerly would
	 * take a number out of `random` for *every* filter - and the ones that use
	 * the stream for something else, like `Puzzler`'s shuffle, would then get a
	 * different sequence than they used to. Once drawn it never changes, which
	 * is the only property that matters.
	 */
	private rolledSeed: number | undefined;

	constructor(options: FilterOptions = {}) {
		this.channel = options.channel ?? 'grey';
		this.enabled = options.enabled !== false;
		this.random = options.random ?? Math.random;
		this.now = options.now ?? defaultClock;
	}

	/**
	 * The seed for the filters that hash their randomness rather than sampling it
	 * - `Cloud`, `Voronoi`, `Noise`.
	 *
	 * **Fixed for the life of the filter**, which is the whole point. It used to
	 * be drawn afresh on every call, so a single `Cloud` produced a different
	 * cloud every time it ran. That was invisible while a still image rendered
	 * once and stopped, and became a strobe the moment anything drove a loop -
	 * including an *unrelated* filter downstream, because an impure stage cannot
	 * be cached and so re-ran with it. Pinning it also makes these three pure, so
	 * a cloud under an animating wave is computed once and reused.
	 *
	 * A filter that declares `seed` in its schema can override the drawn value,
	 * which is how a chain in a URL reproduces the same picture for everyone.
	 */
	get seed(): number {
		const declared = (this.properties as FilterProperties | undefined)?.seed;
		if (typeof declared === 'number') {
			return declared;
		}
		this.rolledSeed ??= seedFrom(this.random);
		return this.rolledSeed;
	}

	process(frame: ImageData | ImageData[]): ImageData {
		if (Array.isArray(frame)) {
			if (!this.enabled) {
				return frame[0];
			}
			//The second frame is a different picture and nothing makes the two agree
			//about size. Every `doProcess` below walks it by byte offset, which for a
			//frame of another width reads a row at a time out of alignment - and off
			//the end of a smaller one, where an undefined lands in a
			//Uint8ClampedArray as 0. Two pure white frames multiplied together came
			//out three quarters black.
			//
			//The shader has always sampled it by normalised uv, so it stretched to
			//fit, which is the answer someone compositing two pictures wants. Doing
			//it here rather than in six filters means the CPU has one implementation
			//of that rather than six, and this is the choke point every caller goes
			//through - including anyone using a filter on its own, away from a
			//Pipeline. Free when the sizes already match.
			return this.doProcess(
				frame[0],
				frame[1] && resampleTo(frame[1], frame[0].width, frame[0].height)
			);
		}

		if (!this.enabled) {
			return frame;
		}
		return this.doProcess(frame);
	}

	doProcess(frame: ImageData, _second?: ImageData): ImageData {
		return frame;
	}

	/** Reads one channel of the pixel at byte offset `pos`. */
	getColourValue(data: ImageData, pos: number, channel?: Channel): number {
		switch (channel ?? this.channel ?? 'grey') {
			case 'red':
			case 'r':
				return data.data[pos];
			case 'green':
			case 'g':
				return data.data[pos + 1];
			case 'blue':
			case 'b':
				return data.data[pos + 2];
			case 'grey':
			default:
				//Rec. 601 luma. The red weight used to be 0.2989, leaving the three
				//weights summing to 0.9999 rather than 1, so a neutral grey came
				//back slightly darker than it went in. Invisible on its own, but it
				//means grey isn't idempotent, and on a filter with a hard decision
				//boundary it flips the answer - a 128 grey reading as 127.99 falls
				//on the wrong side of a threshold of 128.
				//
				//Correcting the weight isn't enough: 0.299 + 0.587 + 0.114 is not
				//exactly 1 in binary floating point either. Scaling by 1000 keeps
				//the sum exact, because 299 + 587 + 114 is exactly 1000.
				return (
					data.data[pos] * 299 +
					data.data[pos + 1] * 587 +
					data.data[pos + 2] * 114
				) / 1000;
		}
	}

	/** This filter's schema, reached from an instance. */
	get schema(): FilterSchema {
		return (this.constructor as typeof Filter).schema;
	}

	/**
	 * The single way to change a property from outside.
	 *
	 * Everything funnels through here so coercion happens in one place. The old
	 * `setInt`/`setFloat`/`toggleBool` trio existed because DOM inputs hand back
	 * *strings*, and every filter had to remember which one to call. Bind a
	 * framework model straight onto `properties` instead and you get
	 * `radius: "10"`, which silently works in some arithmetic and breaks the
	 * rest - `"10" + 1` is `"101"`, and it becomes `NaN` the moment it reaches
	 * `uniform1i`. The schema says what the type is, so the caller doesn't have
	 * to.
	 *
	 * Unknown keys throw, because that is a mistake in the caller rather than
	 * bad user input; out-of-range *values* are clamped rather than rejected.
	 */
	setProperty(key: string, value: unknown): void {
		const field = this.schema[key];
		if (!field) {
			throw new Error(`${this.constructor.name} has no property "${key}"`);
		}

		const coerced = coerceValue(field, value);

		//`channel` is the one field declared on the base class rather than in
		//`properties`, so filters that honour it describe it in their schema but
		//it is stored alongside `enabled` instead.
		if (key === 'channel') {
			this.channel = coerced as Channel;
		} else {
			this.properties[key] = coerced;
		}

		this.dirty = true;
		this.propertyChanged(key);
	}

	/** Flips a boolean property. */
	toggleProperty(key: string): void {
		this.setProperty(key, !this.getProperty(key));
	}

	getProperty(key: string): PropertyValue {
		return key === 'channel' ? this.channel : this.properties[key];
	}

	/**
	 * Called after a property changes, for filters holding state derived from
	 * one - MotionDetector's frame ring, Puzzler's shuffle.
	 *
	 * That rebuilding used to live inside `doCreateControls`, which meant it
	 * only ever ran when the change came from a slider. Setting the property any
	 * other way left the derived state stale, and deleting the DOM code would
	 * have lost the rebuild entirely.
	 */
	propertyChanged(_key: string): void {}

	/**
	 * Drops anything retained from previous frames.
	 *
	 * Only the `stateful` filters have anything to drop. A {@link Pipeline} calls
	 * this whenever the history can no longer be trusted: the chain was edited,
	 * the filter was removed, one of its properties changed, or it moved between
	 * backends. The last of those is the reason this has to be explicit - a
	 * filter that ran as a shader for a while and then fell back to the CPU has
	 * two histories that have diverged, and blending them makes the trail jump.
	 */
	reset(): void {
		//The GPU's copy of the history lives on the backend rather than on the
		//filter, so it cannot be cleared from here directly. Bumping a counter the
		//backend compares against does the same job without the filter needing to
		//know a backend exists.
		this.historyEpoch++;
		this.dropState();
	}

	/** Where a stateful filter throws away whatever it is holding. */
	protected dropState(): void {}

	toggleEnabled(): void {
		this.enabled = !this.enabled;
	}
}
