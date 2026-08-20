//Gradient Map

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { normaliseHex } from '../../core/schema.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterData } from '../../gpu/GLBackend.js';
import type { FilterSchema } from '../../core/schema.js';

export type Ramp = 'fire' | 'ember' | 'ice' | 'thermal' | 'toxic' | 'sepia' | 'spectrum';

/** A ramp is a list of `[position, r, g, b]` stops, interpolated between. */
export type Stop = [number, number, number, number];

/**
 * A ramp written by hand, in either of two spellings.
 *
 * A list of hex colours is the short one and covers most of what anybody wants:
 * the stops are spread evenly and the ramp runs through them in order. Reach for
 * the `[position, r, g, b]` form when the spacing is the point - `ember` spends
 * three quarters of its length getting to orange, and evenly spaced stops cannot
 * say that.
 *
 * ```js
 * new GradientMap({ stops: ['1b2430', 'a8542f', 'f6f3ed'] })
 * new GradientMap({ stops: [[0, 10, 0, 0], [0.75, 220, 70, 10], [1, 255, 170, 60]] })
 * ```
 */
export type RampStops = readonly Stop[] | readonly string[];

export interface GradientMapOptions extends FilterOptions {
	ramp?: Ramp;
	steps?: number;
	cycle?: number;
	offset?: number;
	/**
	 * A ramp of your own, which replaces `ramp` entirely when given.
	 *
	 * Constructor-only, like `random` and `now`, and for the reason set out on
	 * {@link ColourField}: options are not properties. A property has to be one
	 * scalar so it can survive a chain string, a URL and a control - a list of
	 * stops is none of those things, so it stays where the code that wrote it can
	 * reach it and does not pretend to serialise.
	 */
	stops?: RampStops;
}

/**
 * Two stops make a dull ramp. Fire looks like fire because it moves through
 * four or five, on a curve that is not linear in any channel - which is exactly
 * the part worth authoring once here rather than asking anyone to rebuild out
 * of colour sliders.
 *
 * Exported so a custom ramp can start from one of these rather than from
 * nothing - warming `ice` by a mapped channel is a far more likely thing to want
 * than seven stops typed from scratch.
 *
 * Copy before editing. These are the arrays the built-in ramps are read from, so
 * mutating one changes that ramp for every filter in the process.
 */
export const RAMPS: Record<Ramp, Stop[]> = {
	fire: [
		[0, 0, 0, 0], [0.25, 100, 0, 0], [0.5, 220, 50, 0], [0.75, 255, 175, 20], [1, 255, 255, 220]
	],
	//no white at the top: coals rather than flame
	ember: [
		[0, 10, 0, 0], [0.4, 110, 10, 0], [0.75, 220, 70, 10], [1, 255, 170, 60]
	],
	ice: [
		[0, 0, 4, 30], [0.35, 10, 60, 150], [0.7, 80, 190, 235], [1, 240, 253, 255]
	],
	thermal: [
		[0, 0, 0, 25], [0.2, 70, 0, 110], [0.4, 170, 20, 90],
		[0.6, 235, 90, 30], [0.8, 250, 190, 40], [1, 255, 255, 220]
	],
	toxic: [
		[0, 5, 15, 5], [0.35, 20, 90, 25], [0.7, 120, 200, 40], [1, 230, 255, 150]
	],
	sepia: [
		[0, 28, 18, 10], [0.5, 150, 110, 70], [1, 255, 242, 215]
	],
	//ends where it begins, so rotating it has no seam - the one built for cycling
	spectrum: [
		[0, 255, 0, 0], [1 / 6, 255, 255, 0], [2 / 6, 0, 255, 0], [3 / 6, 0, 255, 255],
		[4 / 6, 0, 0, 255], [5 / 6, 255, 0, 255], [1, 255, 0, 0]
	]
};

const RAMP_NAMES = Object.keys(RAMPS) as Ramp[];

/**
 * Whether a ramp ends on the colour it started on, and so can be rotated
 * straight through without a visible join.
 *
 * Read off the stops rather than declared, because it is a fact about them: a
 * ramp that is edited to close, or to stop closing, cannot get this wrong. That
 * is also what lets a hand-written ramp cycle correctly without being asked
 * whether it closes - nobody would think to say, and the answer is sitting in
 * the stops either way.
 */
function closesOn(stops: Stop[]): boolean {
	const first = stops[0];
	const last = stops[stops.length - 1];
	return first[1] === last[1] && first[2] === last[2] && first[3] === last[3];
}

const CLOSES: Record<string, boolean> = Object.fromEntries(
	Object.entries(RAMPS).map(([name, stops]) => [name, closesOn(stops)])
);

/** Six hex digits to the `[r, g, b]` the stop list works in. */
function hexToChannels(hex: string): [number, number, number] {
	const digits = normaliseHex(hex, '000000');
	return [
		parseInt(digits.slice(0, 2), 16),
		parseInt(digits.slice(2, 4), 16),
		parseInt(digits.slice(4, 6), 16)
	];
}

/**
 * A hand-written ramp, made safe to hand to {@link sample}, or `null` if it is
 * not usable at all.
 *
 * `null` rather than a throw, and the caller then falls back to the named ramp.
 * Everything else that crosses into this library from outside is coerced rather
 * than rejected - see `coerceValue` - and a gradient map that renders `fire`
 * because a stop was mistyped beats one that takes the page down.
 *
 * Sorted, because {@link sample} walks the stops assuming they ascend and would
 * otherwise pick a span with a negative width and interpolate backwards through
 * it. Writing them out of order is an easy thing to do and a very confusing
 * thing to debug.
 */
function normaliseStops(input: RampStops): Stop[] | null {
	if (!Array.isArray(input) || input.length < 2) {
		return null;	//a ramp of one colour is a Fill, and of none is nothing
	}

	const stops: Stop[] = [];
	for (let i = 0; i < input.length; i++) {
		const entry = input[i] as string | Stop;

		if (typeof entry === 'string') {
			//The short spelling: colours only, spread evenly across the ramp.
			const [r, g, b] = hexToChannels(entry);
			stops.push([i / (input.length - 1), r, g, b]);
			continue;
		}

		if (!Array.isArray(entry) || entry.length < 4 || entry.some((n) => !Number.isFinite(n))) {
			return null;
		}
		stops.push([
			clamp(entry[0], 0, 1),
			Math.round(clamp(entry[1], 0, 255)),
			Math.round(clamp(entry[2], 0, 255)),
			Math.round(clamp(entry[3], 0, 255))
		]);
	}

	return stops.sort((a, b) => a[0] - b[0]);
}

function clamp(value: number, low: number, high: number): number {
	return value < low ? low : value > high ? high : value;
}

/**
 * Where in the ramp position `t` lands, once rotation has carried it outside
 * 0-1.
 *
 * A closing ramp wraps: it comes back round to where it began and nothing
 * jumps. One that does not close is *folded* instead - swept up the ramp and
 * back down - because wrapping `fire` would slam white straight into black
 * once per cycle, which is a visible tear rather than a fade.
 *
 * Note the fold is the identity on 0-1, so a filter that is not cycling looks
 * exactly as it did before this existed.
 */
function fold(t: number, closes: boolean): number {
	if(closes){
		return t - Math.floor(t);
	}
	const doubled = t - 2 * Math.floor(t / 2);
	return doubled <= 1 ? doubled : 2 - doubled;
}

/**
 * Recolours the frame by brightness, through a named ramp.
 *
 * Every pixel's brightness picks a colour out of a 256-entry table and that
 * colour replaces it. Whatever hue was there is discarded - this is a gradient
 * map, not a grade, and a sunset comes out the colour of fire regardless of
 * what colour the sunset was.
 *
 * Which sounds destructive until you notice how much of this library outputs
 * grey and has nothing to do with it: `Cloud`, `Gradient`, `Contourer`, height
 * maps, `EdgeDetector`, the thresholders, `DifferenceDetector`. A gradient map
 * turns all of them into something to look at, in one stage and with no asset
 * to source from anywhere.
 *
 * `steps` bands the ramp, and `cycle` rotates it - together they are palette
 * cycling, the trick pixel artists used to animate waterfalls and lava without
 * touching a pixel. The bands hold still and the *colours* move through them,
 * which is why `steps` is what makes `cycle` read as flow rather than as a
 * wash.
 *
 * The table is built on the CPU and handed to the shader through `data()`, so
 * both paths look colours up in the same bytes rather than each evaluating the
 * ramp its own way. All that is left to disagree about is which entry a pixel
 * lands on. That indirection is also why a ramp of your own costs no shader
 * work at all: the shader never knew what a ramp was, only how to read 256
 * bytes.
 *
 * ```js
 * new GradientMap({ stops: ['1b2430', 'a8542f', 'f6f3ed'] })  // evenly spread
 * new GradientMap({ stops: RAMPS.ice.map(([at, r, g, b]) => [at, r + 30, g, b]) })
 * map.setStops(null);                                         // back to `ramp`
 * ```
 *
 * A custom ramp is a constructor option rather than a property, so it does not
 * appear in a chain string, a URL or a generated control - see
 * {@link GradientMapOptions.stops} for why. `steps`, `cycle` and `offset` all
 * work on it unchanged.
 */
export class GradientMap extends Filter {
	//`cycle` reads the clock. Marked always-varying rather than per instance,
	//because the flag is a static: the cost is a still frame recomputing when it
	//need not, on a filter that is one texture fetch.
	static override varying = true;

	//Only the rotation reads the clock, so a static ramp is a still picture and
	//there is nothing for a frame loop to reveal.
	static override animated(filter: any): boolean {
		return filter.properties.cycle !== 0;
	}

	static override shader = /* glsl */ `
void main(){
	ivec2 p = outPixel();
	vec4 here = srcTexel(p);

	//channelValue, not luma, so 'channel' picks which one drives the ramp
	int index = int(clamp(channelValue(here), 0.0, 255.0) + 0.5);
	writePixel(vec4(dataTexel(index, 0).rgb, here.a));
}
`;

	/** The 256-entry table, which is the whole filter. */
	static override data(filter: any): FilterData {
		return { width: 256, height: 1, bytes: buildTable(filter) };
	}

	static override schema: FilterSchema = {
		ramp: {
			type: 'select',
			label: 'Ramp',
			default: 'fire',
			description: 'Which colours brightness maps onto. Spectrum runs right round the hues, so cycling it sweeps continuously; the rest sweep up and back down.',
			options: [
				{ value: 'fire', label: 'Fire - black through red and orange to white' },
				{ value: 'ember', label: 'Ember - coals, with no white at the top' },
				{ value: 'ice', label: 'Ice - deep blue through cyan to white' },
				{ value: 'thermal', label: 'Thermal - the heat-camera ramp' },
				{ value: 'toxic', label: 'Toxic - greens' },
				{ value: 'sepia', label: 'Sepia - warm monochrome' },
				{ value: 'spectrum', label: 'Spectrum - every hue, and it loops' }
			]
		},
		steps: {
			type: 'int',
			label: 'Steps',
			min: 2,
			max: 32,
			step: 1,
			default: null,
			nullable: true,
			nullLabel: 'smooth',
			description: 'Bands the ramp into this many colours. Empty leaves it smooth; a low number is what makes cycling read as flow.'
		},
		cycle: {
			type: 'float',
			label: 'Cycle',
			min: -2,
			max: 2,
			step: 0.05,
			default: 0,
			description: 'Rotations of the ramp per second. Negative runs it the other way, 0 holds still.'
		},
		offset: {
			type: 'float',
			label: 'Offset',
			min: 0,
			max: 1,
			step: 0.01,
			default: 0,
			description: 'Where in the ramp the darkest pixel starts.'
		}
	};

	override properties: {
		ramp: Ramp;
		steps: number | null;
		cycle: number;
		offset: number;
	};

	/**
	 * The hand-written ramp, or `null` to use the named one.
	 *
	 * A plain field rather than a property, so it is absent from the schema, the
	 * controls a host builds and the chain string - which is the honest place for
	 * it. See {@link GradientMapOptions.stops}.
	 */
	stops: Stop[] | null;

	constructor(options: GradientMapOptions = {}) {
		super(options);
		this.properties = {
			ramp: RAMP_NAMES.includes(options.ramp as Ramp) ? (options.ramp as Ramp) : 'fire',
			steps: options.steps === undefined || options.steps === null ? null : Math.round(options.steps),
			cycle: options.cycle === undefined ? 0 : options.cycle,
			offset: options.offset === undefined ? 0 : options.offset
		};
		this.stops = options.stops === undefined ? null : normaliseStops(options.stops);
	}

	/**
	 * Swaps the ramp for a different one after construction, or back to the named
	 * ramp with `null`.
	 *
	 * Exists so that changing the ramp goes through something that marks the
	 * filter dirty, the way {@link Filter.setProperty} does for everything else.
	 * Assigning to `stops` directly works today only because this filter declares
	 * itself `varying` and is therefore never served from cache - which is a
	 * reason it happens to survive, not a reason to rely on it.
	 */
	setStops(value: RampStops | null): void {
		this.stops = value === null ? null : normaliseStops(value);
		this.dirty = true;
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const table = buildTable(this);

		for(let i = 0; i < frame.data.length; i += 4){
			const value = this.getColourValue(frame, i);
			const index = Math.min(255, Math.max(0, Math.round(value))) * 4;

			output.data[i  ] = table[index];
			output.data[i+1] = table[index+1];
			output.data[i+2] = table[index+2];
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}
}

/** The ramp at `at`, which must already be in 0-1, as whole 0-255 channels. */
function sample(stops: Stop[], at: number): [number, number, number] {
	let upper = 1;
	while(upper < stops.length - 1 && stops[upper][0] < at){
		upper++;
	}

	const a = stops[upper - 1];
	const b = stops[upper];
	const span = b[0] - a[0];
	//Clamped, so a ramp that does not reach 0 or 1 holds its end colour out to
	//the edge instead of extrapolating past it. A no-op for the built-ins, which
	//all span the full range - it is there for a hand-written ramp whose first
	//stop is at 0.3, where the unclamped `k` goes negative and runs the
	//interpolation backwards off the end of the colour it started from.
	const k = span <= 0 ? 0 : clamp((at - a[0]) / span, 0, 1);

	return [
		Math.round(a[1] + (b[1] - a[1]) * k),
		Math.round(a[2] + (b[2] - a[2]) * k),
		Math.round(a[3] + (b[3] - a[3]) * k)
	];
}

/**
 * The lookup table for a filter's current settings.
 *
 * Banding happens *before* the rotation on purpose. Quantising the position
 * fixes where the bands are, and the rotation then moves colours through them -
 * which is what palette cycling is. Rotating first and banding after would
 * slide the band edges instead, and the picture would appear to crawl.
 */
function buildTable(filter: GradientMap): Uint8Array {
	const ramp = filter.properties.ramp;
	//A hand-written ramp replaces the named one rather than blending with it, and
	//`closes` comes off whichever list won - so a custom ramp that happens to end
	//where it began cycles seamlessly, exactly as `spectrum` does.
	const custom = filter.stops;
	const stops = custom ?? RAMPS[ramp] ?? RAMPS.fire;
	const closes = custom ? closesOn(custom) : (CLOSES[ramp] ?? false);
	const steps = filter.properties.steps;
	const phase = (filter.now() / 1000) * filter.properties.cycle + filter.properties.offset;

	const bytes = new Uint8Array(256 * 4);
	for(let i = 0; i < 256; i++){
		let t = i / 255;
		if(steps !== null && steps > 1){
			t = Math.min(steps - 1, Math.floor(t * steps)) / (steps - 1);
		}

		const [r, g, b] = sample(stops, fold(t + phase, closes));
		bytes[i*4  ] = r;
		bytes[i*4+1] = g;
		bytes[i*4+2] = b;
		bytes[i*4+3] = 255;
	}
	return bytes;
}
