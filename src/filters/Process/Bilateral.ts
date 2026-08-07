//Bilateral object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { Filter as FilterType } from '../../core/Filter.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface BilateralOptions extends FilterOptions {
	radius?: number;
	similarity?: number;
	iterations?: number;
}

/**
 * Blurs the flat areas and leaves the edges where they are.
 *
 * An ordinary blur averages a neighbourhood by *distance* alone, so it cannot
 * tell the inside of a region from its boundary and softens both. This weights
 * each neighbour twice - once for how far away it is, and once for how
 * different it looks - so a pixel on the far side of an edge contributes almost
 * nothing, and the edge survives a blur strong enough to erase the noise beside
 * it. Skin smoothing, denoising and the cartoon look are all this filter.
 *
 * **It is not separable, and that is the whole cost of it.** `Blur` runs
 * horizontally and then vertically because a 2D Gaussian factors into two 1D
 * ones - at radius 8 that is 34 samples rather than 289. The range weight here
 * depends on the *centre* pixel, so the two directions no longer commute and
 * the factorisation does not exist: a separated bilateral is a different filter
 * that happens to look similar, and it leaves streaks along whichever axis ran
 * first. So this takes the full square, and at radius 8 it really is 289
 * samples a pixel - by a distance the most expensive filter in the library, and
 * the one most worth running on the GPU.
 *
 * `similarity` is the parameter that matters. It is measured in the same units
 * a pixel is - the mean squared difference across the three channels, so a flat
 * grey step of 30 is a difference of 30 - which means it can be read as "how
 * far apart two colours may be and still count as the same surface". Below
 * about 10 almost nothing is smoothed; above about 60 it stops being able to
 * see edges and becomes a slow ordinary blur.
 *
 * The range weight is one number for all three channels rather than one each,
 * which is what keeps colour from bleeding: a neighbour that matches in red and
 * not in blue is a different colour, and is discounted for red as well.
 *
 * `iterations` is worth more than radius for the cartoon look. Several small
 * passes flatten a region towards a single colour while sharpening its
 * boundary each time, where one large pass mostly just averages more widely -
 * the same reason `Convolver` has it, and it repeats the shader rather than
 * rebuilding anything.
 */
export class Bilateral extends Filter {
	static override shader = [
		{
			source: /* glsl */ `
uniform float u_radius;
uniform float u_similarity;

void main(){
	ivec2 p = outPixel();
	vec4 here = srcTexel(p);

	int radius = int(u_radius);
	//Half the radius, so the kernel's edge sits two sigma out and the weights
	//have most of the way to fall before they are cut off. Derived rather than
	//given, because a spatial sigma nobody can see the effect of separately
	//from the radius is a property that would only ever be left alone.
	float spatial = max(float(radius) * 0.5, 0.0001);
	float spatialK = -1.0 / (2.0 * spatial * spatial);
	float rangeK = -1.0 / (2.0 * u_similarity * u_similarity);

	vec3 acc = vec3(0.0);
	float total = 0.0;

	for(int y = -radius; y <= radius; y++){
		for(int x = -radius; x <= radius; x++){
			//srcTexel clamps, so the frame edge repeats rather than reading
			//black and dragging the border towards it
			vec3 there = srcTexel(p + ivec2(x, y)).rgb;

			vec3 apart = there - here.rgb;
			//mean of the three squared differences, so u_similarity reads as a
			//per-channel difference rather than as a Euclidean RGB distance
			float range = dot(apart, apart) / 3.0;
			float distance = float(x*x + y*y);

			float weight = exp(distance * spatialK + range * rangeK);
			acc += there * weight;
			total += weight;
		}
	}

	//total can never be zero: the centre pixel is in the loop and its own
	//weight is exp(0)
	writePixel(vec4(acc / total, here.a));
}
`,
			repeat: (filter: FilterType) => Math.max(1, Number(filter.properties.iterations))
		}
	];

	static override schema: FilterSchema = {
		radius: {
			type: 'int',
			label: 'Radius',
			min: 1,
			max: 8,
			step: 1,
			default: 4,
			description: 'How far to reach for neighbours. Costs the square of this, not twice it, because a bilateral filter cannot be separated into two passes the way a blur can.'
		},
		similarity: {
			type: 'int',
			label: 'Similarity',
			min: 1,
			max: 128,
			step: 1,
			default: 30,
			description: 'How far apart two colours may be and still count as the same surface, in the units a pixel is measured in. Low keeps almost every edge and smooths almost nothing; high stops seeing edges at all and leaves an ordinary blur.'
		},
		iterations: {
			type: 'int',
			label: 'Iterations',
			min: 1,
			max: 4,
			step: 1,
			default: 1,
			description: 'Run it again on its own output. Several small passes flatten a region towards one colour and sharpen its boundary each time, which is the cartoon look; one big pass mostly just averages more widely.'
		}
	};

	override properties: {
		radius: number;
		similarity: number;
		iterations: number;
	};

	constructor(options: BilateralOptions = {}) {
		super(options);
		this.properties = {
			radius: options.radius || 4,
			similarity: options.similarity || 30,
			iterations: options.iterations || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let source = frame;

		//each pass reads the previous pass's output, so iterations compound -
		//the twin of the shader pass's `repeat`
		for(let i = 0; i < this.properties.iterations; i++){
			source = this.onePass(source);
		}

		return source;
	}

	/** One full square of the kernel. Twin of the shader. */
	private onePass(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const { radius, similarity } = this.properties;
		const width = frame.width;
		const height = frame.height;

		const spatial = Math.max(radius * 0.5, 0.0001);
		const spatialK = -1 / (2 * spatial * spatial);
		const rangeK = -1 / (2 * similarity * similarity);

		//the spatial half depends only on the offset, so it is the same for
		//every pixel and comes out of the inner loop entirely
		const side = radius*2 + 1;
		const spatialWeights = new Float64Array(side * side);
		for(let y = -radius; y <= radius; y++){
			for(let x = -radius; x <= radius; x++){
				spatialWeights[(y + radius)*side + (x + radius)] = Math.exp((x*x + y*y) * spatialK);
			}
		}

		for(let py = 0; py < height; py++){
			for(let px = 0; px < width; px++){
				const at = (py*width + px)*4;
				const centreRed   = frame.data[at];
				const centreGreen = frame.data[at+1];
				const centreBlue  = frame.data[at+2];

				let accRed = 0, accGreen = 0, accBlue = 0, total = 0;

				for(let y = -radius; y <= radius; y++){
					//clamped, so the frame edge repeats - matching srcTexel
					const sy = Math.min(height - 1, Math.max(0, py + y));

					for(let x = -radius; x <= radius; x++){
						const sx = Math.min(width - 1, Math.max(0, px + x));
						const from = (sy*width + sx)*4;

						const red   = frame.data[from];
						const green = frame.data[from+1];
						const blue  = frame.data[from+2];

						const dr = red - centreRed;
						const dg = green - centreGreen;
						const db = blue - centreBlue;
						const range = (dr*dr + dg*dg + db*db) / 3;

						const weight = spatialWeights[(y + radius)*side + (x + radius)] * Math.exp(range * rangeK);

						accRed   += red   * weight;
						accGreen += green * weight;
						accBlue  += blue  * weight;
						total    += weight;
					}
				}

				output.data[at]   = accRed   / total;
				output.data[at+1] = accGreen / total;
				output.data[at+2] = accBlue  / total;
				output.data[at+3] = frame.data[at+3];
			}
		}

		return output;
	}
}
