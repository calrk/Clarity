//Dot Crawl object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface DotCrawlOptions extends FilterOptions {
	intensity?: number;
	speed?: number;
}

/** Rec. 601, matching `luma()` in the shader prelude and `getColourValue`. */
const LUMA_R = 299 / 1000;
const LUMA_G = 587 / 1000;
const LUMA_B = 114 / 1000;

/**
 * The crawling dots composite video leaves along colour edges.
 *
 * In NTSC and PAL, luma and chroma share one signal, and the colour subcarrier
 * beats against fine luma detail. The result is a checkerboard of dots that
 * clings to sharp *colour* boundaries and shifts a step every frame, so it
 * appears to crawl up the edge - the shimmer on a red caption over a blue
 * background on an old tape.
 *
 * Chroma edges, not luma edges, which is the whole character of it: a
 * black-and-white frame shows none of this no matter how much detail it has.
 * Chroma here is the colour with its brightness removed, so the strength is
 * how far the hue moves between neighbouring pixels rather than how far the
 * brightness does.
 *
 * The companion to `Bleed`, which smears chroma sideways, and `HanoverBars`,
 * which rotates it line by line.
 */
export class DotCrawl extends Filter {
	//the pattern moves with the clock, so the same frame twice is not the same
	static override varying = true;

	//The checkerboard steps once per beat; at speed 0 there is no beat.
	static override animated(filter: any): boolean {
		return filter.properties.speed !== 0;
	}

	static override shader = /* glsl */ `
uniform float u_intensity;
uniform float u_speed;

void main(){
	ivec2 p = outPixel();
	vec4 here = srcTexel(p);
	vec4 right = srcTexel(p + ivec2(1, 0));

	//chroma is the colour with its brightness taken out
	vec3 c0 = here.rgb - luma(here);
	vec3 c1 = right.rgb - luma(right);
	float edge = length(c1 - c0);

	//A checkerboard that shifts one step per frame. Stepping it rather than
	//sliding it is what makes the dots crawl instead of shimmer in place.
	float phase = floor(uTime * u_speed / 1000.0);
	float dots = mod(float(p.x + p.y) + phase, 2.0) < 1.0 ? -1.0 : 1.0;

	writePixel(vec4(here.rgb + dots * edge * u_intensity, here.a));
}
`;

	static override schema: FilterSchema = {
		intensity: {
			type: 'float',
			label: 'Intensity',
			min: 0,
			max: 2,
			step: 0.05,
			default: 0.5,
			description: 'How strong the dots are, as a multiple of the colour difference they sit on.'
		},
		speed: {
			type: 'float',
			label: 'Speed',
			min: 0,
			max: 30,
			step: 0.5,
			default: 8,
			description: 'How many times a second the pattern steps. 0 freezes it.'
		}
	};

	override properties: {
		intensity: number;
		speed: number;
	};

	constructor(options: DotCrawlOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity === undefined ? 0.5 : options.intensity,
			speed: options.speed === undefined ? 8 : options.speed
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;
		const { intensity, speed } = this.properties;

		const phase = Math.floor(this.now() * speed / 1000);

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const i = (y*width + x)*4;
				//the last column has no neighbour to its right; srcTexel clamps,
				//so it compares with itself and the edge there is zero
				const n = (y*width + Math.min(width - 1, x + 1))*4;

				const l0 = frame.data[i]*LUMA_R + frame.data[i+1]*LUMA_G + frame.data[i+2]*LUMA_B;
				const l1 = frame.data[n]*LUMA_R + frame.data[n+1]*LUMA_G + frame.data[n+2]*LUMA_B;

				const dr = (frame.data[n]   - l1) - (frame.data[i]   - l0);
				const dg = (frame.data[n+1] - l1) - (frame.data[i+1] - l0);
				const db = (frame.data[n+2] - l1) - (frame.data[i+2] - l0);
				const edge = Math.sqrt(dr*dr + dg*dg + db*db);

				const dots = (x + y + phase) % 2 < 1 ? -1 : 1;
				const shift = dots * edge * intensity;

				output.data[i  ] = frame.data[i  ] + shift;
				output.data[i+1] = frame.data[i+1] + shift;
				output.data[i+2] = frame.data[i+2] + shift;
				output.data[i+3] = frame.data[i+3];
			}
		}

		return output;
	}
}
