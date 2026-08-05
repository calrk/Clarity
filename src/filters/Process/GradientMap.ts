//Gradient Map

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterData } from '../../gpu/GLBackend.js';
import type { FilterSchema } from '../../core/schema.js';

export type Ramp = 'fire' | 'ember' | 'ice' | 'thermal' | 'toxic' | 'sepia' | 'spectrum';

export interface GradientMapOptions extends FilterOptions {
	ramp?: Ramp;
	steps?: number;
	cycle?: number;
	offset?: number;
}

/** A ramp is a list of `[position, r, g, b]` stops, interpolated between. */
type Stop = [number, number, number, number];

/**
 * Two stops make a dull ramp. Fire looks like fire because it moves through
 * four or five, on a curve that is not linear in any channel - which is exactly
 * the part worth authoring once here rather than asking anyone to rebuild out
 * of colour sliders.
 */
const RAMPS: Record<Ramp, Stop[]> = {
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
 * lands on.
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
			description: 'Which colours brightness maps onto. Spectrum is the one that loops, so it cycles without a seam.',
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

	constructor(options: GradientMapOptions = {}) {
		super(options);
		this.properties = {
			ramp: RAMP_NAMES.includes(options.ramp as Ramp) ? (options.ramp as Ramp) : 'fire',
			steps: options.steps === undefined || options.steps === null ? null : Math.round(options.steps),
			cycle: options.cycle === undefined ? 0 : options.cycle,
			offset: options.offset === undefined ? 0 : options.offset
		};
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

/** The ramp at `t`, wrapped into 0-1, as whole 0-255 channels. */
function sample(stops: Stop[], t: number): [number, number, number] {
	const at = t - Math.floor(t);

	let upper = 1;
	while(upper < stops.length - 1 && stops[upper][0] < at){
		upper++;
	}

	const a = stops[upper - 1];
	const b = stops[upper];
	const span = b[0] - a[0];
	const k = span <= 0 ? 0 : (at - a[0]) / span;

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
	const stops = RAMPS[filter.properties.ramp] ?? RAMPS.fire;
	const steps = filter.properties.steps;
	const phase = (filter.now() / 1000) * filter.properties.cycle + filter.properties.offset;

	const bytes = new Uint8Array(256 * 4);
	for(let i = 0; i < 256; i++){
		let t = i / 255;
		if(steps !== null && steps > 1){
			t = Math.min(steps - 1, Math.floor(t * steps)) / (steps - 1);
		}

		const [r, g, b] = sample(stops, t + phase);
		bytes[i*4  ] = r;
		bytes[i*4+1] = g;
		bytes[i*4+2] = b;
		bytes[i*4+3] = 255;
	}
	return bytes;
}
