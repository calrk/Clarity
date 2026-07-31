import { Interface } from '../helpers/Interface.js';
import { defaultClock } from './random.js';
import type { Clock, RandomSource } from './random.js';

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
export type FilterProperties = Record<string, number | boolean | null>;

/**
 * Base class for every filter.
 *
 * Subclasses implement `doProcess`; `process` handles the enabled check and
 * unpacks the two-frame form used by the DualInput filters.
 */
export class Filter {
	channel: Channel;
	enabled: boolean;
	properties: FilterProperties = {};

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

	setFloat(key: string, value: string | number): void {
		this.properties[key] = typeof value === 'number' ? value : parseFloat(value);
	}

	setInt(key: string, value: string | number): void {
		this.properties[key] = typeof value === 'number' ? Math.trunc(value) : parseInt(value, 10);
	}

	toggleBool(key: string): void {
		this.properties[key] = !this.properties[key];
	}

	toggleEnabled(): void {
		this.enabled = !this.enabled;
	}

	createControls(titleSet?: string): HTMLElement {
		const controls = Interface.createControlGroup(titleSet, this.enabled);
		const toggle = controls.getElementsByTagName('input')[0];
		toggle.addEventListener('change', () => this.toggleEnabled());

		controls.appendChild(this.doCreateControls());
		return controls;
	}

	doCreateControls(): HTMLElement {
		return Interface.createLabel('No options.');
	}
}
