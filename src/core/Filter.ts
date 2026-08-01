import { defaultClock } from './random.js';
import { coerceValue } from './schema.js';
import type { Clock, RandomSource } from './random.js';
import type { FilterSchema, PropertyValue } from './schema.js';

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

	/** Injectable so filter output can be made reproducible - see FEATURES.md #6. */
	random: RandomSource;
	now: Clock;

	constructor(options: FilterOptions = {}) {
		this.channel = options.channel ?? 'grey';
		this.enabled = options.enabled !== false;
		this.random = options.random ?? Math.random;
		this.now = options.now ?? defaultClock;
	}

	process(frame: ImageData | ImageData[]): ImageData {
		if (Array.isArray(frame)) {
			if (!this.enabled) {
				return frame[0];
			}
			return this.doProcess(frame[0], frame[1]);
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
	 * one - Sharpen's kernel, MotionDetector's frame ring, Puzzler's shuffle.
	 *
	 * That rebuilding used to live inside `doCreateControls`, which meant it
	 * only ever ran when the change came from a slider. Setting the property any
	 * other way left the derived state stale, and deleting the DOM code would
	 * have lost the rebuild entirely.
	 */
	propertyChanged(_key: string): void {}

	toggleEnabled(): void {
		this.enabled = !this.enabled;
	}
}
