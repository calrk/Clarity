//Dither object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type DitherMode = 'bayer' | 'diffusion';
export type DitherMatrix = '2' | '4' | '8';

/** Matrix order, matching the schema's options: index + 1 is log2 of the side. */
const MATRICES: DitherMatrix[] = ['2', '4', '8'];

/**
 * The Bayer threshold at a pixel, as an index into a size x size matrix.
 *
 * Built by bit interleaving rather than from a table, which is the same matrix
 * the recursive construction gives and needs no storage: at each level the
 * bits of x^y and y say which quadrant this pixel falls in, and shifting the
 * result left as the loop walks outward puts the coarsest level in the most
 * significant position. Checked against the classic 2x2 - 0, 2, 3, 1.
 */
function bayerIndex(x: number, y: number, order: number): number {
	let result = 0;
	for (let i = 0; i < order; i++) {
		const xo = (x >> i) & 1;
		const yo = (y >> i) & 1;
		result = (result << 2) | ((xo ^ yo) << 1) | yo;
	}
	return result;
}

export interface DitherOptions extends FilterOptions {
	mode?: DitherMode;
	levels?: number;
	matrix?: DitherMatrix;
	monochrome?: boolean;
}

/**
 * Quantises to a few levels and hides the banding in a pattern.
 *
 * `Posteriser` answers the same question and takes the other side of it: it
 * picks the best few colours and accepts flat bands. This keeps a fixed ladder
 * of levels and spends the error on texture instead, so a gradient that would
 * band comes out as a stipple that reads, at a distance, as the colour that was
 * never available.
 *
 * **The two modes are genuinely different algorithms, and this is the one
 * honest use of `supportsGPU` in the library.** Ordered dithering compares each
 * pixel against a fixed matrix - it needs nothing but its own coordinates, so
 * it is a pure gather and runs as a shader. Floyd-Steinberg pushes each pixel's
 * quantisation error into neighbours it *has not visited yet*, so pixel N+1
 * cannot be computed until pixel N is done. That is not a shader, and no amount
 * of cleverness makes it one, so the filter declares that half CPU-only rather
 * than pretending or dropping the mode.
 *
 * They look different in a way worth knowing before choosing: **Bayer is
 * regular and diffusion is organic**. The crosshatch of an ordered matrix is
 * visible as a texture in its own right, which is exactly the retro-computer
 * look people usually want it for; diffusion leaves no pattern at all, holds
 * detail better, and costs the ability to tile or to animate without the grain
 * swimming.
 *
 * `levels` is per channel, so 2 is one bit each and gives eight colours in
 * colour mode - which is the classic. `monochrome` dithers luma instead and
 * gives the newsprint end of it.
 */
export class Dither extends Filter {
	//Only the ordered half can be a shader; see the class note.
	static override supportsGPU(filter: any): boolean {
		return filter.properties.mode === 'bayer';
	}

	static override shader = /* glsl */ `
uniform float u_levels;
uniform float u_matrix;
uniform float u_monochrome;

/** Twin of the bayerIndex above - see it for why this needs no table. */
int bayerIndex(int x, int y, int order){
	int result = 0;
	for(int i = 0; i < 3; i++){
		if(i >= order){
			break;
		}
		int xo = (x >> i) & 1;
		int yo = (y >> i) & 1;
		result = (result << 2) | ((xo ^ yo) << 1) | yo;
	}
	return result;
}

void main(){
	ivec2 p = outPixel();
	int order = int(u_matrix + 0.5) + 1;
	int side = 1 << order;

	//Centred on zero and scaled to one quantisation step, so the threshold
	//nudges a value at most half a step either way - enough to cross the
	//boundary in proportion to how far up the step the value already was, which
	//is the whole of what a dither does.
	float step_ = 255.0 / (u_levels - 1.0);
	float offset = ((float(bayerIndex(p.x, p.y, order)) + 0.5) / float(side * side) - 0.5) * step_;

	vec4 here = srcTexel(p);

	if(u_monochrome > 0.5){
		float v = luma(here) + offset;
		float q = clamp(floor(v / step_ + 0.5), 0.0, u_levels - 1.0) * step_;
		writeRGB(vec3(q));
		return;
	}

	vec3 v = here.rgb + offset;
	vec3 q = clamp(floor(v / step_ + 0.5), vec3(0.0), vec3(u_levels - 1.0)) * step_;
	writeRGB(q);
}
`;

	static override schema: FilterSchema = {
		mode: {
			type: 'select',
			label: 'Mode',
			default: 'bayer',
			description: 'Ordered compares each pixel against a fixed matrix and leaves a visible crosshatch. Diffusion pushes the error into neighbouring pixels and leaves no pattern, but is sequential, so it always runs on the CPU.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'bayer', label: 'Ordered - Bayer matrix' },
				{ value: 'diffusion', label: 'Diffusion - Floyd-Steinberg' }
			]
		},
		levels: {
			type: 'int',
			label: 'Levels',
			min: 2,
			max: 16,
			step: 1,
			default: 2,
			description: 'Shades kept per channel. 2 is one bit each, which is eight colours - the classic. In monochrome it is the number of greys.'
		},
		matrix: {
			type: 'select',
			label: 'Matrix',
			default: '8',
			description: 'Side of the ordered matrix. Bigger carries more shades and a finer pattern; 2 is four thresholds and very coarse. Ignored by diffusion, which has no matrix.',
			options: [
				{ value: '2', label: '2 x 2 - coarse' },
				{ value: '4', label: '4 x 4' },
				{ value: '8', label: '8 x 8 - fine' }
			]
		},
		monochrome: {
			type: 'bool',
			label: 'Monochrome',
			default: false,
			description: 'Dither brightness to greys rather than each channel separately. At 2 levels this is the one-bit newsprint look.'
		}
	};

	override properties: {
		mode: DitherMode;
		levels: number;
		matrix: DitherMatrix;
		monochrome: boolean;
	};

	constructor(options: DitherOptions = {}) {
		super(options);
		this.properties = {
			mode: options.mode ?? 'bayer',
			levels: options.levels || 2,
			matrix: options.matrix ?? '8',
			monochrome: options.monochrome || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		return this.properties.mode === 'bayer' ? this.ordered(frame) : this.diffused(frame);
	}

	/** Twin of the shader. */
	private ordered(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const { levels, monochrome } = this.properties;
		const order = MATRICES.indexOf(this.properties.matrix) + 1;
		const side = 1 << order;
		const cells = side * side;
		const step = 255 / (levels - 1);

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				const at = (y*frame.width + x)*4;
				const offset = ((bayerIndex(x, y, order) + 0.5) / cells - 0.5) * step;

				if(monochrome){
					const v = this.getColourValue(frame, at, 'grey') + offset;
					const q = Math.min(levels - 1, Math.max(0, Math.floor(v/step + 0.5))) * step;
					output.data[at] = output.data[at+1] = output.data[at+2] = q;
				} else {
					for(let c = 0; c < 3; c++){
						const v = frame.data[at+c] + offset;
						output.data[at+c] = Math.min(levels - 1, Math.max(0, Math.floor(v/step + 0.5))) * step;
					}
				}

				output.data[at+3] = frame.data[at+3];
			}
		}

		return output;
	}

	/**
	 * Floyd-Steinberg, in raster order.
	 *
	 * The error goes to four neighbours in the proportions Floyd and Steinberg
	 * published - 7, 3, 5 and 1 sixteenths - and every one of them is ahead of
	 * the current pixel in reading order. That is the whole reason this cannot
	 * be a shader: a fragment has no way to read a value another fragment has
	 * not written yet, and no way to be told to wait.
	 *
	 * The working buffer holds floats rather than bytes because the error is
	 * fractional and accumulates; rounding it into a Uint8ClampedArray at each
	 * step is what makes a naive implementation lose the fine detail it exists
	 * to keep.
	 */
	private diffused(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;
		const { levels, monochrome } = this.properties;
		const step = 255 / (levels - 1);
		const channels = monochrome ? 1 : 3;

		const work = new Float64Array(width*height*channels);
		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const at = (y*width + x)*4;
				if(monochrome){
					work[y*width + x] = this.getColourValue(frame, at, 'grey');
				} else {
					for(let c = 0; c < 3; c++){
						work[(y*width + x)*3 + c] = frame.data[at+c];
					}
				}
			}
		}

		const spread = (x: number, y: number, c: number, error: number, share: number) => {
			if(x < 0 || x >= width || y >= height){
				return;
			}
			work[(y*width + x)*channels + c] += error * share;
		};

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				for(let c = 0; c < channels; c++){
					const i = (y*width + x)*channels + c;
					const old = work[i];
					const quantised = Math.min(levels - 1, Math.max(0, Math.floor(old/step + 0.5))) * step;
					work[i] = quantised;

					const error = old - quantised;
					spread(x + 1, y,     c, error, 7/16);
					spread(x - 1, y + 1, c, error, 3/16);
					spread(x,     y + 1, c, error, 5/16);
					spread(x + 1, y + 1, c, error, 1/16);
				}
			}
		}

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const at = (y*width + x)*4;
				if(monochrome){
					const v = work[y*width + x];
					output.data[at] = output.data[at+1] = output.data[at+2] = v;
				} else {
					for(let c = 0; c < 3; c++){
						output.data[at+c] = work[(y*width + x)*3 + c];
					}
				}
				output.data[at+3] = frame.data[at+3];
			}
		}

		return output;
	}
}
