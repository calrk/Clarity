//Convolver object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type ConvolverPreset = 'smooth' | 'sharpen' | 'sobel' | 'laplace' | 'emboss';

/**
 * The kernels, row-major, in the order the schema declares them - a select
 * uniform arrives as its index, so the order here and the order there are the
 * same list and must not drift.
 */
const KERNELS: Record<ConvolverPreset, { weights: number[]; divisor: number }> = {
	smooth:  { weights: [ 1,  2,  1,   2,  4,  2,   1,  2,  1], divisor: 16 },
	sharpen: { weights: [-1, -1, -1,  -1,  9, -1,  -1, -1, -1], divisor: 1 },
	//sobel is the odd one out; see the note on the class
	sobel:   { weights: [-1,  0,  1,  -2,  0,  2,  -1,  0,  1], divisor: 1 },
	laplace: { weights: [ 0,  1,  0,   1, -4,  1,   0,  1,  0], divisor: 1 },
	emboss:  { weights: [-2, -1,  0,  -1,  1,  1,   0,  1,  2], divisor: 1 }
};

/** The second half of Sobel: the same kernel turned through 90 degrees. */
const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

export interface ConvolverOptions extends FilterOptions {
	preset?: ConvolverPreset;
	amount?: number;
	iterations?: number;
}

/**
 * A 3x3 convolution, with the classic kernels as presets.
 *
 * One filter rather than five files. `Sharpen` was a kernel with a scale on it
 * and `Smoother` was a kernel with a repeat count, so both are presets here -
 * and `Smoother`'s kernel was wrong in a way that is worth recording, because
 * it is the reason this replaces rather than merely absorbs it: it left the
 * centre pixel out of its own average, giving frequency response
 * `(cos 2*pi*u + cos 2*pi*v) / 2`, which is exactly -1 at the diagonal Nyquist.
 * A one-pixel checkerboard came back inverted at full strength instead of
 * smoothed, and iterating flipped it back and forth forever. The `smooth`
 * preset here is a proper Gaussian and converges.
 *
 * `sobel` is not a single kernel and is deliberately special-cased: edge
 * strength is the magnitude of two perpendicular gradients, so it runs both and
 * takes `sqrt(gx^2 + gy^2)`. Offering the two halves separately would be purer
 * and would mean nobody could get the thing they actually wanted in one stage.
 */
export class Convolver extends Filter {
	static override shader = [
		{
			source: /* glsl */ `
uniform float u_preset;
uniform float u_amount;

const float K_SMOOTH[9]  = float[9]( 1.0,  2.0,  1.0,   2.0,  4.0,  2.0,   1.0,  2.0,  1.0);
const float K_SHARPEN[9] = float[9](-1.0, -1.0, -1.0,  -1.0,  9.0, -1.0,  -1.0, -1.0, -1.0);
const float K_SOBEL_X[9] = float[9](-1.0,  0.0,  1.0,  -2.0,  0.0,  2.0,  -1.0,  0.0,  1.0);
const float K_SOBEL_Y[9] = float[9](-1.0, -2.0, -1.0,   0.0,  0.0,  0.0,   1.0,  2.0,  1.0);
const float K_LAPLACE[9] = float[9]( 0.0,  1.0,  0.0,   1.0, -4.0,  1.0,   0.0,  1.0,  0.0);
const float K_EMBOSS[9]  = float[9](-2.0, -1.0,  0.0,  -1.0,  1.0,  1.0,   0.0,  1.0,  2.0);

void main(){
	ivec2 p = outPixel();
	vec4 here = srcTexel(p);
	int preset = int(u_preset + 0.5);

	vec3 acc = vec3(0.0);
	vec3 accY = vec3(0.0);

	//srcTexel clamps to the frame, so the border repeats its edge pixel rather
	//than reading black and drawing a dark frame around everything
	for(int ky = -1; ky <= 1; ky++){
		for(int kx = -1; kx <= 1; kx++){
			int i = (ky + 1) * 3 + (kx + 1);
			vec3 texel = srcTexel(p + ivec2(kx, ky)).rgb;

			if(preset == 0)      { acc += K_SMOOTH[i]  * texel; }
			else if(preset == 1) { acc += K_SHARPEN[i] * texel; }
			else if(preset == 2) { acc += K_SOBEL_X[i] * texel; accY += K_SOBEL_Y[i] * texel; }
			else if(preset == 3) { acc += K_LAPLACE[i] * texel; }
			else                 { acc += K_EMBOSS[i]  * texel; }
		}
	}

	vec3 result = preset == 2
		? sqrt(acc * acc + accY * accY)
		: acc / (preset == 0 ? 16.0 : 1.0);

	//Blends back towards the source. Above 1 it extrapolates rather than
	//interpolates, which is exactly what over-sharpening is, and is how this
	//covers the range Sharpen's 'intensity' used to.
	writePixel(vec4(here.rgb + (result - here.rgb) * u_amount, here.a));
}
`,
			repeat: (filter: Filter) => Math.max(1, Number(filter.properties.iterations))
		}
	];

	static override schema: FilterSchema = {
		preset: {
			type: 'select',
			label: 'Kernel',
			default: 'sharpen',
			description: 'Which 3x3 matrix to convolve with. Sobel is the magnitude of two perpendicular ones.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'smooth', label: 'Smooth - Gaussian blur' },
				{ value: 'sharpen', label: 'Sharpen' },
				{ value: 'sobel', label: 'Sobel - edges' },
				{ value: 'laplace', label: 'Laplace - thin edges' },
				{ value: 'emboss', label: 'Emboss' }
			]
		},
		amount: {
			type: 'float',
			label: 'Amount',
			min: 0,
			max: 3,
			step: 0.1,
			default: 1,
			description: 'Blends the result back over the original. 0 does nothing, 1 is the plain kernel, above 1 overshoots.'
		},
		iterations: {
			type: 'int',
			label: 'Iterations',
			min: 1,
			max: 5,
			step: 1,
			default: 1,
			description: 'How many times to run the kernel, each pass over the last output.'
		}
	};

	override properties: {
		preset: ConvolverPreset;
		amount: number;
		iterations: number;
	};

	constructor(options: ConvolverOptions = {}) {
		super(options);
		this.properties = {
			preset: options.preset ?? 'sharpen',
			amount: options.amount === undefined ? 1 : options.amount,
			iterations: options.iterations || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const { weights, divisor } = KERNELS[this.properties.preset];
		const isSobel = this.properties.preset === 'sobel';
		const amount = this.properties.amount;
		const width = frame.width;
		const height = frame.height;

		let source = frame;
		let output = frame;

		//each pass reads the previous pass's output, so iterations compound
		for(let z = 0; z < this.properties.iterations; z++){
			output = createImageData(width, height);

			for(let y = 0; y < height; y++){
				for(let x = 0; x < width; x++){
					let r = 0, g = 0, b = 0;
					let ry = 0, gy = 0, by = 0;

					for(let ky = -1; ky <= 1; ky++){
						//clamped rather than skipped, matching srcTexel - a skipped
						//border leaves a dark frame around every result
						const sy = Math.min(height - 1, Math.max(0, y + ky));
						for(let kx = -1; kx <= 1; kx++){
							const sx = Math.min(width - 1, Math.max(0, x + kx));
							const at = (sy*width + sx)*4;
							const w = weights[(ky + 1)*3 + (kx + 1)];

							r += w * source.data[at];
							g += w * source.data[at+1];
							b += w * source.data[at+2];

							if(isSobel){
								const wy = SOBEL_Y[(ky + 1)*3 + (kx + 1)];
								ry += wy * source.data[at];
								gy += wy * source.data[at+1];
								by += wy * source.data[at+2];
							}
						}
					}

					if(isSobel){
						r = Math.sqrt(r*r + ry*ry);
						g = Math.sqrt(g*g + gy*gy);
						b = Math.sqrt(b*b + by*by);
					} else {
						r /= divisor;
						g /= divisor;
						b /= divisor;
					}

					const i = (y*width + x)*4;
					output.data[i  ] = source.data[i  ] + (r - source.data[i  ])*amount;
					output.data[i+1] = source.data[i+1] + (g - source.data[i+1])*amount;
					output.data[i+2] = source.data[i+2] + (b - source.data[i+2])*amount;
					output.data[i+3] = source.data[i+3];
				}
			}

			source = output;
		}

		return output;
	}
}
