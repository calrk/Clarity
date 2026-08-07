//Skeletiser object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { Filter as FilterType } from '../../core/Filter.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface SkeletiserOptions extends FilterOptions {
	iterations?: number;
}

/**
 * Thins a shape down to the lines running through the middle of it.
 *
 * Zhang-Suen thinning. Each pass deletes boundary pixels that can be removed
 * without breaking the shape apart, so a thick blob loses layer after layer
 * until only a one-pixel skeleton is left - the same letter, the same rough
 * outline, but reduced to its centre lines.
 *
 * **The distinction from `Morphology` erode is the whole point.** Erode also
 * removes boundary pixels, but it removes *all* of them, so a shape shrinks and
 * eventually disappears. Thinning tests each pixel for whether deleting it
 * would disconnect its neighbours, and refuses when it would. A ring erodes
 * into nothing and thins into a thinner ring.
 *
 * **This runs as a shader, which is not obvious and is the reason it turned out
 * cheap.** Thinning sounds inherently sequential - delete a pixel and its
 * neighbour's answer changes - but Zhang-Suen is specifically designed to avoid
 * that. Each of its two sub-iterations marks pixels using only the previous
 * pass's state and deletes them all at once, which is a pure gather over a 3x3
 * neighbourhood and exactly what a fragment shader does. The two sub-iterations
 * alternate, and they alternate here by reading `uPass`, the repeat index the
 * executor already sets on every draw - so one pass repeated `2 x iterations`
 * times is the whole GPU implementation.
 *
 * The two differ only in which corner they attack, and running just one of them
 * eats the shape from one side. That is why the count below is doubled rather
 * than being a free choice: **an odd number of sub-iterations is not a thinner
 * skeleton, it is a lopsided one.**
 *
 * `iterations` is a fixed count rather than repeating until nothing changes,
 * which is what makes this a shader at all - "until stable" needs a readback
 * between every pass to ask whether anything moved, and that is the stall the
 * whole GPU backend exists to avoid. Nothing is lost by it, because **thinning
 * converges**: once a shape is one pixel wide there is nothing left that can be
 * deleted without breaking it, so further passes are no-ops. Overshooting is
 * free, and the count only has to be at least half the thickness of the fattest
 * thing in the frame.
 *
 * Input is thresholded at mid-grey, so the filter is defined for any frame -
 * but the trait says `binary-in` because that is a fallback, not a feature. A
 * photograph thresholded at exactly 128 is rarely the shape anyone wanted; put
 * a thresholder in front and choose.
 */
export class Skeletiser extends Filter {
	static override shader = [
		{
			source: /* glsl */ `
uniform float u_iterations;
uniform float uPass;

/** 1 where the shape is. Also the threshold, on the first pass. */
int on(ivec2 p){
	return luma(srcTexel(p)) >= 128.0 ? 1 : 0;
}

void main(){
	ivec2 p = outPixel();

	if(on(p) == 0){
		writeRGB(vec3(0.0));
		return;
	}

	//P2 is north and they run clockwise, which is the ordering the transition
	//count below depends on
	int p2 = on(p + ivec2( 0, -1));
	int p3 = on(p + ivec2( 1, -1));
	int p4 = on(p + ivec2( 1,  0));
	int p5 = on(p + ivec2( 1,  1));
	int p6 = on(p + ivec2( 0,  1));
	int p7 = on(p + ivec2(-1,  1));
	int p8 = on(p + ivec2(-1,  0));
	int p9 = on(p + ivec2(-1, -1));

	//neighbours that are on: fewer than 2 is an end point, which must be kept
	//or lines would be eaten from their tips; more than 6 is interior, and
	//deleting it would punch a hole
	int b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;

	//0 to 1 transitions going once around. Exactly one means the neighbours
	//form a single connected run, so removing the centre cannot split them -
	//this is the test that makes it thinning rather than erosion
	int a = 0;
	if(p2 == 0 && p3 == 1) a++;
	if(p3 == 0 && p4 == 1) a++;
	if(p4 == 0 && p5 == 1) a++;
	if(p5 == 0 && p6 == 1) a++;
	if(p6 == 0 && p7 == 1) a++;
	if(p7 == 0 && p8 == 1) a++;
	if(p8 == 0 && p9 == 1) a++;
	if(p9 == 0 && p2 == 1) a++;

	//the executor's repeat index, so one declared pass covers both
	bool second = (int(uPass + 0.5) - (int(uPass + 0.5) / 2) * 2) == 1;

	bool corners = second
		? (p2*p4*p8 == 0 && p2*p6*p8 == 0)
		: (p2*p4*p6 == 0 && p4*p6*p8 == 0);

	bool trim = b >= 2 && b <= 6 && a == 1 && corners;

	writeRGB(vec3(trim ? 0.0 : 255.0));
}
`,
			//two sub-iterations to a pass, and they have to come in pairs
			repeat: (filter: FilterType) => Math.max(1, Number(filter.properties.iterations)) * 2
		}
	];

	static override schema: FilterSchema = {
		iterations: {
			type: 'int',
			label: 'Iterations',
			min: 1,
			max: 30,
			step: 1,
			default: 12,
			description: 'How many times to peel a layer off. Thinning converges, so anything past the point where the shape is already one pixel wide changes nothing - set it to about half the thickness of the fattest shape in the frame, and higher is only slower.'
		}
	};

	override properties: {
		iterations: number;
	};

	constructor(options: SkeletiserOptions = {}) {
		super(options);
		this.properties = {
			iterations: options.iterations || 12
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let source = frame;

		//twin of the shader pass's `repeat`: two sub-iterations a round, and the
		//sub-iteration is the pass index's parity exactly as `uPass` is there
		const rounds = this.properties.iterations * 2;
		for(let pass = 0; pass < rounds; pass++){
			source = this.onePass(source, pass % 2 === 1);
		}

		return source;
	}

	/** One Zhang-Suen sub-iteration. Twin of the shader. */
	private onePass(frame: ImageData, second: boolean): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;

		//clamped, so the frame edge repeats rather than reading black. Reading
		//black would thin inwards from every border, which is the same reason
		//Morphology clamps - a shape running off the edge is not a shape that
		//stops there.
		const on = (x: number, y: number) => {
			const sx = Math.min(width - 1, Math.max(0, x));
			const sy = Math.min(height - 1, Math.max(0, y));
			return this.getColourValue(frame, (sy*width + sx)*4, 'grey') >= 128 ? 1 : 0;
		};

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const at = (y*width + x)*4;

				if(on(x, y) === 0){
					output.data[at] = output.data[at+1] = output.data[at+2] = 0;
					output.data[at+3] = 255;
					continue;
				}

				const p2 = on(x,     y - 1);
				const p3 = on(x + 1, y - 1);
				const p4 = on(x + 1, y);
				const p5 = on(x + 1, y + 1);
				const p6 = on(x,     y + 1);
				const p7 = on(x - 1, y + 1);
				const p8 = on(x - 1, y);
				const p9 = on(x - 1, y - 1);

				const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;

				const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
				let a = 0;
				for(let i = 0; i < 8; i++){
					if(ring[i] === 0 && ring[i+1] === 1) a++;
				}

				const corners = second
					? (p2*p4*p8 === 0 && p2*p6*p8 === 0)
					: (p2*p4*p6 === 0 && p4*p6*p8 === 0);

				const trim = b >= 2 && b <= 6 && a === 1 && corners;
				const value = trim ? 0 : 255;

				output.data[at] = output.data[at+1] = output.data[at+2] = value;
				output.data[at+3] = 255;
			}
		}

		return output;
	}
}
