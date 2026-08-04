//Morphology object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type MorphologyMode = 'dilate' | 'erode' | 'open' | 'close';

export interface MorphologyOptions extends FilterOptions {
	mode?: MorphologyMode;
	radius?: number;
}

/** Mode index, matching the schema's option order, to the two ops it runs. */
const OPS: Record<MorphologyMode, [number, number]> = {
	//[first op, second op]; 1 takes the maximum, -1 the minimum, 0 does nothing
	dilate: [1, 0],
	erode: [-1, 0],
	open: [-1, 1],
	close: [1, -1]
};

/**
 * One axis of a min or max over the structuring element.
 *
 * Morphology with a square element is separable exactly as a blur is - the
 * maximum over a box is the maximum of the row maxima - so this runs as two
 * passes of 2r+1 taps rather than one of (2r+1)^2. At radius 10 that is 42
 * samples instead of 441.
 */
const MORPH_PASS = (axis: string) => /* glsl */ `
uniform float u_mode;
uniform float u_radius;
uniform float uPhase;

void main(){
	ivec2 p = outPixel();
	int mode = int(u_mode + 0.5);
	int phase = int(uPhase + 0.5);

	//Which op this pass performs. Dilate and close begin by taking the maximum,
	//erode and open by taking the minimum; the second pair of passes finishes
	//the compound modes and does nothing for the simple ones.
	int op;
	if(phase < 2){
		op = (mode == 0 || mode == 3) ? 1 : -1;
	} else {
		op = (mode == 0 || mode == 1) ? 0 : (mode == 2 ? 1 : -1);
	}

	if(op == 0){
		//a bit-exact copy, so an unused pass cannot round anything
		fragColor = texelFetch(uSrc, p, 0);
		return;
	}

	int radius = int(u_radius);
	ivec2 step_ = ivec2(${axis});
	vec4 here = srcTexel(p);
	vec3 acc = here.rgb;

	for(int i = -radius; i <= radius; i++){
		//srcTexel clamps, so the frame edge repeats rather than reading black -
		//reading black would erode inwards from every border
		vec3 texel = srcTexel(p + step_ * i).rgb;
		acc = op > 0 ? max(acc, texel) : min(acc, texel);
	}

	writePixel(vec4(acc, here.a));
}
`;

/**
 * Dilate, erode, open and close.
 *
 * These generalise past binary images, which is why this replaces `DotRemover`
 * rather than sitting beside it: morphology is defined by *ordering*, not by 0
 * and 1. Dilate is the local maximum over the structuring element and erode the
 * local minimum, so on a photograph dilate spreads highlights and swallows dark
 * speckle while erode does the reverse. The binary case is the special case.
 *
 * `open` is erode then dilate: it removes anything smaller than the element and
 * leaves everything else the size it was, which is the despeckle. `close` is
 * the other way round and fills small holes. `DotRemover` flipped isolated
 * pixels in *both* directions at once, so its exact equivalent is an open
 * followed by a close - two stages in a chain, which is what a pipeline is for.
 *
 * Radius is the reach, and it is the thing to turn up: a bigger element removes
 * bigger specks and spreads highlights further.
 */
export class Morphology extends Filter {
	static override shader = [
		{ source: MORPH_PASS('1, 0'), uniforms: { uPhase: 0 } },
		{ source: MORPH_PASS('0, 1'), uniforms: { uPhase: 1 } },
		{ source: MORPH_PASS('1, 0'), uniforms: { uPhase: 2 } },
		{ source: MORPH_PASS('0, 1'), uniforms: { uPhase: 3 } }
	];

	static override schema: FilterSchema = {
		mode: {
			type: 'select',
			label: 'Mode',
			default: 'dilate',
			description: 'Dilate grows light regions, erode shrinks them. Open removes small light specks, close fills small dark holes, and neither moves the edges that survive.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'dilate', label: 'Dilate - grow light' },
				{ value: 'erode', label: 'Erode - shrink light' },
				{ value: 'open', label: 'Open - despeckle' },
				{ value: 'close', label: 'Close - fill holes' }
			]
		},
		radius: {
			type: 'int',
			label: 'Radius',
			min: 1,
			max: 20,
			step: 1,
			default: 1,
			description: 'How far the effect reaches, in pixels. Bigger removes bigger specks and spreads further.'
		}
	};

	override properties: {
		mode: MorphologyMode;
		radius: number;
	};

	constructor(options: MorphologyOptions = {}) {
		super(options);
		this.properties = {
			mode: options.mode ?? 'dilate',
			radius: options.radius || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const [first, second] = OPS[this.properties.mode];
		const radius = this.properties.radius;

		//the same four passes the shader runs, in the same order, so the two
		//paths agree pass for pass rather than only at the end
		let current = frame;
		for (const op of [first, second]) {
			if (op === 0) {
				continue;
			}
			current = this.sweep(current, op, radius, 1, 0);
			current = this.sweep(current, op, radius, 0, 1);
		}

		if (current === frame) {
			//no op ran; hand back a copy rather than the caller's frame
			const copy = createImageData(frame.width, frame.height);
			copy.data.set(frame.data);
			return copy;
		}
		return current;
	}

	/** One axis: the min or max of each run of 2r+1 pixels. */
	sweep(frame: ImageData, op: number, radius: number, stepX: number, stepY: number): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const at = (y*width + x)*4;
				let r = frame.data[at];
				let g = frame.data[at+1];
				let b = frame.data[at+2];

				for(let i = -radius; i <= radius; i++){
					//clamped, matching srcTexel - reading past the edge as black
					//would erode inwards from every border
					const sx = Math.min(width - 1, Math.max(0, x + stepX*i));
					const sy = Math.min(height - 1, Math.max(0, y + stepY*i));
					const from = (sy*width + sx)*4;

					if(op > 0){
						if(frame.data[from]   > r) r = frame.data[from];
						if(frame.data[from+1] > g) g = frame.data[from+1];
						if(frame.data[from+2] > b) b = frame.data[from+2];
					} else {
						if(frame.data[from]   < r) r = frame.data[from];
						if(frame.data[from+1] < g) g = frame.data[from+1];
						if(frame.data[from+2] < b) b = frame.data[from+2];
					}
				}

				output.data[at  ] = r;
				output.data[at+1] = g;
				output.data[at+2] = b;
				output.data[at+3] = frame.data[at+3];
			}
		}

		return output;
	}
}
