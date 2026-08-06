//Cloud object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedByte } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type CloudFold = 'none' | 'ridged' | 'billow';

/** Twin of the shader's `NOISE_SCALE`. */
const NOISE_SCALE = 1.5;

/**
 * The eight directions a lattice corner's gradient can take, as the shader's
 * `dotGradient` spells them out.
 *
 * Components are 0 and +/-1 on purpose. A normalised diagonal would put an
 * irrational constant in the parity-critical path, where float32 and float64
 * round differently; with these, every product is exact on both backends.
 * Unequal gradient lengths are what Perlin's original did too.
 *
 * Typed arrays, and read inline in the loop rather than through a helper,
 * because this is four lookups per octave per pixel. The same arithmetic behind
 * a six-argument function does not get inlined and costs four times as much as
 * the value noise it replaced - measured, not guessed. Inlined it costs about a
 * third more, which is what the better-looking noise is worth.
 */
const GX = new Float64Array([1, -1, 0, 0, 1, -1, 1, -1]);
const GY = new Float64Array([0, 0, 1, -1, 1, 1, -1, -1]);

export interface CloudOptions extends FilterOptions {
	seed?: number | null;
	linear?: boolean;
	/** Folds each octave about its midpoint - see {@link Cloud}. */
	fold?: CloudFold;
	/** Amplitude falloff per octave. Null keeps the original harmonic one. */
	persistence?: number | null;
	iterations?: number;
	initialSize?: number;
}

/**
 * Fractal gradient noise, in grey.
 *
 * It used to carry `red`, `green` and `blue` that scaled the noise into each
 * channel, plus an `opaque` that derived alpha from them - four of its ten
 * properties spent on tinting, and the only starter that did it. `Gradient` had
 * already made the opposite call in writing: a coloured ramp is this multiplied
 * by a fill, one more stage against several more properties nobody sets. So the
 * colour lives downstream now, where `GradientMap` gives it seven hand-authored
 * ramps that are richer than a flat tint ever was, and `Voronoi` and the rest of
 * the greyscale-out family read the same way.
 *
 * The default output has not moved: the colours defaulted to white, which
 * scaled the noise by 1 and produced exactly this grey.
 */
export class Cloud extends Filter {
	//Pure, now that the seed is fixed per instance rather than drawn on every
	//call. It used to be varying, which meant a single Cloud produced a new
	//field every time it ran - invisible while a still rendered once, and a
	//strobe as soon as anything drove a loop. See Filter.seed.

	static override shader = /* glsl */ `
uniform float u_linear;
uniform float u_fold;
uniform float u_persistence;
uniform float u_persistence_auto;
uniform float u_iterations;
uniform float u_initialSize;

const float NOISE_SCALE = 1.5;

/**
 * One of eight fixed directions per lattice corner, dotted with the offset
 * from that corner - the whole of the difference between gradient noise and
 * value noise.
 *
 * The components are integers on purpose. A normalised diagonal would put an
 * irrational constant in the parity-critical path, where float32 and float64
 * round differently; with +/-1 the dot product is only additions of the offset,
 * which both backends compute the same way. Unequal gradient lengths are what
 * Perlin's original did too, and it costs nothing visible.
 */
float dotGradient(int x, int y, int z, float ox, float oy){
	int g = int(hashedByte(x, y, z, uSeed)) & 7;
	if(g == 0) return ox;
	if(g == 1) return -ox;
	if(g == 2) return oy;
	if(g == 3) return -oy;
	if(g == 4) return ox + oy;
	if(g == 5) return oy - ox;
	if(g == 6) return ox - oy;
	return -ox - oy;
}

void main(){
	ivec2 p = outPixel();
	ivec2 frame = ivec2(uSize);
	int grid = int(u_initialSize);
	int used = 0;
	float total = 0.0;
	float weight = 0.0;

	//the schema caps iterations at 10, and a loop bound has to be a constant
	for(int z = 0; z < 10; z++){
		if(z >= int(u_iterations)){
			break;
		}
		if(z > 0){
			grid *= 2;
		}
		if(grid > frame.x){
			break;
		}
		used++;

		//integer arithmetic for the cell and the position within it, so the two
		//backends land in the same cell rather than disagreeing at its edge
		int remX = (p.x * grid) % frame.x;
		int remY = (p.y * grid) % frame.y;
		int x1 = (p.x * grid - remX) / frame.x;
		int y1 = (p.y * grid - remY) / frame.y;
		int x2 = (x1 + 1) % grid;
		int y2 = (y1 + 1) % grid;

		//Position within the cell, and the fade curve applied to it. Quintic
		//rather than cubic smoothstep: cubic has a discontinuous second
		//derivative at the cell boundary, which is invisible in the noise and
		//very visible in anything that differentiates it - a normal map.
		float xf = float(remX) / float(frame.x);
		float yf = float(remY) / float(frame.y);
		float u = xf;
		float v = yf;
		if(u_linear < 0.5){
			u = xf * xf * xf * (xf * (xf * 6.0 - 15.0) + 10.0);
			v = yf * yf * yf * (yf * (yf * 6.0 - 15.0) + 10.0);
		}

		//each corner contributes a slope through zero, not a height
		float top = mix(dotGradient(x1, y1, z, xf, yf), dotGradient(x2, y1, z, xf - 1.0, yf), u);
		float bottom = mix(dotGradient(x1, y2, z, xf, yf - 1.0), dotGradient(x2, y2, z, xf - 1.0, yf - 1.0), u);

		//Signed and centred on zero; everything downstream works in 0-255, and
		//127.5 is exactly where the fold creases. The scale spends the range on
		//the values that actually occur - raw output reaches +/-1 but its rms is
		//0.24, so mapping the extremes directly would leave a flat grey frame.
		float octave = clamp(mix(top, bottom, v) * NOISE_SCALE * 127.5 + 127.5, 0.0, 255.0);

		//The fold, and it has to happen here rather than on the finished sum.
		//Folding once gives a single crease; folding every octave gives the
		//branching ridge network, because each octave's midpoint crossings cut
		//across the coarser one's.
		if(u_fold > 0.5){
			float folded = abs(octave - 127.5) * 2.0;
			//Ridged is squared, which is Musgrave's formulation and not
			//decoration: 1 - |n| is biased high - it averaged 172 of 255 here -
			//so the crests wash out against an already-bright field. Squaring
			//pushes the mid-tones down and leaves the ridge lines at full
			//brightness. Billow is not squared; it is the fold as it comes.
			octave = u_fold > 1.5 ? folded : (255.0 - folded) * (255.0 - folded) / 255.0;
		}

		//Amplitude of this octave. The original falloff is harmonic - 1, 1/2,
		//1/3, 1/4 - which keeps the fine octaves louder than standard fBm does.
		//That is tolerable on plain cloud and much less so once folding sharpens
		//every octave, so persistence offers the usual p^z instead. Weighting
		//the normaliser the same way keeps the harmonic path arithmetically
		//identical to what it was.
		float amp = u_persistence_auto > 0.5 ? 1.0 / float(z + 1) : pow(u_persistence, float(z));
		total += octave * amp;
		weight += u_persistence_auto > 0.5 ? 1.0 : amp;
	}

	if(used == 0){
		//initialSize was wider than the frame. Opaque black rather than a
		//transparent frame, which is what it used to be only because alpha was
		//derived from colours that no longer exist.
		writeRGB(vec3(0.0));
		return;
	}

	writeRGB(vec3(total / weight));
}
`;

	static override schema: FilterSchema = {
		seed: {
			type: 'int',
			label: 'Seed',
			min: 0,
			max: 16777215,
			step: 1,
			default: null,
			nullable: true,
			nullLabel: 'random',
			description: 'Which cloud. Left empty it picks one when the filter is made and keeps it; set, the same number always gives the same result - which is what makes a link reproduce.'
		},
		linear: { type: 'bool', label: 'Linear', default: false, description: 'Skip the fade curve on the cell blend. Cheaper, and it makes the lattice edges visible.' },
		fold: {
			type: 'select',
			label: 'Fold',
			default: 'none',
			description: 'Folds each octave about zero. Ridged gives sharp crests over broad basins - terrain rather than fog; billow gives puffy cells with dark seams.',
			options: [
				{ value: 'none', label: 'None' },
				{ value: 'ridged', label: 'Ridged - hills and valleys' },
				{ value: 'billow', label: 'Billow - puffy' }
			]
		},
		persistence: {
			type: 'float',
			label: 'Persistence',
			min: 0.1,
			max: 0.9,
			step: 0.05,
			default: 0.5,
			nullable: true,
			nullLabel: 'Harmonic',
			description: 'How much quieter each octave is than the last. Lower is smoother; 0.5 is standard fBm. Harmonic is the original falloff, kept for compatibility - it also darkens the frame the more octaves you ask for.'
		},
		iterations: { type: 'int', label: 'Iterations', min: 1, max: 10, step: 1, default: 4, description: 'Octaves of value noise.' },
		initialSize: { type: 'int', label: 'Initial size', min: 1, max: 16, step: 1, default: 4, description: 'Grid size of the coarsest octave.' }
	};

	override properties: {
		seed: number | null;
		linear: boolean;
		fold: CloudFold;
		persistence: number | null;
		iterations: number;
		initialSize: number;
	};

	constructor(options: CloudOptions = {}) {
		super(options);
		this.properties = {
			seed: options.seed === undefined || options.seed === null ? null : Math.round(options.seed),
			linear: options.linear || false,
			fold: options.fold ?? 'none',
			//not `?? 0.5`: that would turn an explicit null - the caller asking
			//for the harmonic falloff - back into the default
			persistence: options.persistence === undefined ? 0.5 : options.persistence,
			iterations: options.iterations || 4,
			initialSize: options.initialSize || 4
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//One draw per frame; every grid value is hashed from its own coordinates
		//after that. It used to draw size*size values per octave in row-major
		//order, which a shader cannot reproduce - fragments have no order to draw
		//in. See src/helpers/hash.ts.
		const seed = this.seed;

		let size = this.properties.initialSize;
		let used = 0;
		let weight = 0;
		let totals = new Float64Array(frame.width*frame.height);

		for(let z = 0; z < this.properties.iterations; z++){
			if(z > 0){
				size *= 2;	//octaves double; the old size *= (z+1) gave 4, 8, 24, 96
			}
			if(size > frame.width){
				break;
			}
			used ++;

			//see the shader: harmonic weights every octave 1 for normalising, so
			//that path stays bit-for-bit what it was before persistence existed
			const persistence = this.properties.persistence;
			const amp = persistence === null ? 1/(z+1) : Math.pow(persistence, z);
			weight += persistence === null ? 1 : amp;

			for(let y = 0; y < frame.height; y++){
				//Which cell this row falls in, and how far through it, in integer
				//arithmetic. The old form was `(y % (height/size)) / (height/size)`,
				//a modulo by a possibly fractional number, which only meant anything
				//when the grid divided the frame exactly.
				let remY = (y*size) % frame.height;
				let y1 = (y*size - remY) / frame.height;
				let y2 = (y1 + 1) % size;
				let yf = remY / frame.height;
				let v = this.properties.linear ? yf : this.smootherStep(yf);

				for(let x = 0; x < frame.width; x++){
					let remX = (x*size) % frame.width;
					let x1 = (x*size - remX) / frame.width;
					let x2 = (x1 + 1) % size;
					let xf = remX / frame.width;
					let u = this.properties.linear ? xf : this.smootherStep(xf);

					//the four corner gradients, each dotted with the offset from
					//that corner to here - see GX/GY above for why it is inline
					const g00 = hashedByte(x1, y1, z, seed) & 7;
					const g10 = hashedByte(x2, y1, z, seed) & 7;
					const g01 = hashedByte(x1, y2, z, seed) & 7;
					const g11 = hashedByte(x2, y2, z, seed) & 7;

					let top = this.linearInterpolate(
						GX[g00]*xf + GY[g00]*yf,
						GX[g10]*(xf - 1) + GY[g10]*yf, u);
					let bottom = this.linearInterpolate(
						GX[g01]*xf + GY[g01]*(yf - 1),
						GX[g11]*(xf - 1) + GY[g11]*(yf - 1), u);

					//signed and centred on zero, mapped into the 0-255 the rest of
					//the filter works in - see the shader for the scale
					let octave = Math.min(255, Math.max(0,
						this.linearInterpolate(top, bottom, v) * NOISE_SCALE * 127.5 + 127.5));
					//per octave, not on the finished sum - see the shader
					if(this.properties.fold !== 'none'){
						let folded = Math.abs(octave - 127.5) * 2;
						//ridged is squared - see the shader
						octave = this.properties.fold === 'billow' ? folded : (255-folded)*(255-folded)/255;
					}

					totals[y*frame.width + x] += octave * amp;
				}
			}
		}

		for(let k = 0; k < frame.width*frame.height; k ++){
			let j = k * 4;
			//used == 0 means initialSize was wider than the frame and nothing was
			//accumulated; the totals are all zero, so this writes opaque black
			let value = used === 0 ? 0 : totals[k]/weight;
			output.data[j  ] = value;
			output.data[j+1] = value;
			output.data[j+2] = value;
			output.data[j+3] = 255;
		}
		return output;
	}


	linearInterpolate(min: any, max: any, x: any) {
		return min+(max-min)*x;
	}

	smoothStep(x: any) {
		return x*x*(3 - 2*x);
	}

	smootherStep(x: any) {
		return x*x*x*(x*(x*6 - 15) + 10);
	}
}
