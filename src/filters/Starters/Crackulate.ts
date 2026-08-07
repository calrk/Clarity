//Crackulate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hash32 } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface CrackulateOptions extends FilterOptions {
	seed?: number | null;
	levels?: number;
	jitter?: number;
	width?: number;
	roughness?: number;
}

/**
 * Cracks a surface, in grey - the last of the 2014 wishlist.
 *
 * **Recursive splitting, not a cell diagram, and the difference is the whole
 * reason this is not `Voronoi,mode=borders`.** A Voronoi seam network is what
 * you get when every cell forms at once: three seams meet at a Y-junction, and
 * no seam ever stops, because each one is the boundary between two neighbours
 * for its entire length. Real fracture is *sequential*. A crack propagates
 * until it reaches an existing crack and then stops dead, because an open crack
 * is a free surface and cannot carry the stress across. So mud, glaze, old
 * varnish and dried paint are full of **T-junctions and dead ends**, and that
 * is what the eye reads as cracked rather than as tiled.
 *
 * Splitting a region and then splitting the halves reproduces that exactly, and
 * for free: a child's crack runs only within its own half, so it terminates on
 * its parent's crack at whatever angle it arrives - a T. The order of the
 * splits is the order of the fracturing, and the recursion is the size
 * hierarchy, big cracks first and finer ones subdividing what they left.
 *
 * It is also why this is a shader. There is no network to store and no
 * propagation to simulate: a pixel walks down the tree it happens to be in,
 * `levels` steps of a loop, and the deepest cell it lands in is decided by the
 * splits it fell on the near side of. Neighbouring pixels on opposite sides of
 * a crack take different paths and never need to agree about anything.
 *
 * Grey out, like `Cloud`, `Voronoi` and `Woodgrain`, and dark in the cracks the
 * way `Voronoi`'s seams are - so `NormalGenerator` reads them as grooves
 * without being told, which is what the 2014 note meant by cracks over a
 * texture. `GradientMap` colours it and `Multiply` lays it over a photograph.
 */
export class Crackulate extends Filter {
	static override shader = /* glsl */ `
uniform float u_levels;
uniform float u_jitter;
uniform float u_width;
uniform float u_roughness;

/** The top 24 bits as 0-1, matching hashedRandom's conversion. */
float unitOf(uint h){
	return float(h >> 8) / 16777216.0;
}

/** Smooth 1D value noise, -0.5 to 0.5. Twin of wobble() on the CPU. */
float wobble(float t, uint key){
	float i = floor(t);
	float f = t - i;
	float a = unitOf(hash32(key ^ uint(int(i) + 4096))) - 0.5;
	float b = unitOf(hash32(key ^ uint(int(i) + 4097))) - 0.5;
	f = f * f * (3.0 - 2.0 * f);
	return a + (b - a) * f;
}

void main(){
	vec2 here = vec2(outPixel()) + 0.5;

	//pixels rather than uv, so width is a width and the splitting stays
	//square on a frame that is not
	vec2 lo = vec2(0.0);
	vec2 hi = uSize;

	uint path = uint(uSeed);
	float best = 1e9;
	int levels = int(u_levels + 0.5);

	for(int level = 0; level < 16; level++){
		if(level >= levels){
			break;
		}

		vec2 span = hi - lo;
		//always split the longer side, or cells degenerate into slivers after a
		//few levels and the cracks all end up parallel
		bool splitX = span.x >= span.y;

		path = hash32(path);
		//jitter 0 splits exactly in half; 1 reaches most of the way to an edge,
		//stopping short so a cell cannot be split into nothing
		float t = 0.5 + (unitOf(path) - 0.5) * u_jitter * 0.8;
		float at = splitX ? mix(lo.x, hi.x, t) : mix(lo.y, hi.y, t);

		//Where the crack actually runs. Axis-aligned splits alone come out as a
		//treemap rather than as a surface - structurally right, with every
		//T-junction where it should be, and reading as a city plan. The split
		//stays on its axis for bookkeeping and the *drawn* line leans and
		//meanders away from it.
		float along = splitX ? here.y : here.x;
		float reach = splitX ? (hi.y - lo.y) : (hi.x - lo.x);
		float middle = splitX ? (lo.y + hi.y) * 0.5 : (lo.x + hi.x) * 0.5;

		uint shape = hash32(path ^ 0xc2b2ae35u);
		float lean = (unitOf(shape) - 0.5) * u_roughness * 1.4;
		float meander = wobble(along / max(reach, 1.0) * 3.0, shape) * u_roughness * reach * 0.3;
		float line = at + lean * (along - middle) + meander;

		float across = splitX ? here.x : here.y;
		best = min(best, abs(across - line));

		//Descend on the drawn line rather than on the axis split, which keeps the
		//T-junctions: a child can only draw inside its own side of the parent's
		//crack, so its own crack has to stop when it arrives there. The bounds
		//keep the un-leaned split, so every pixel in a region still agrees about
		//where the next one goes.
		if(across < line){
			if(splitX){ hi.x = at; } else { hi.y = at; }
			path = hash32(path ^ 0x9e3779b9u);
		} else {
			if(splitX){ lo.x = at; } else { lo.y = at; }
			path = hash32(path ^ 0x85ebca6bu);
		}
	}

	//0 in the crack, 1 on the surface
	writeRGB(vec3(clamp(best / max(u_width, 0.5), 0.0, 1.0) * 255.0));
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
			description: 'Which arrangement of cracks. Left empty it picks one when the filter is made and keeps it; set, the same number always gives the same result - which is what makes a link reproduce.'
		},
		levels: {
			type: 'int',
			label: 'Levels',
			min: 1,
			max: 16,
			step: 1,
			default: 8,
			description: 'How many times to split. Each level halves the pieces, so this is the number of cracks in a hierarchy rather than a count - one more level is twice as many pieces.'
		},
		jitter: {
			type: 'float',
			label: 'Jitter',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.7,
			description: 'How far off centre a crack may fall. 0 splits everything exactly in half and gives a regular grid; 1 gives pieces of wildly different sizes.'
		},
		width: {
			type: 'float',
			label: 'Width',
			min: 0.5,
			max: 8,
			step: 0.5,
			default: 1.5,
			description: 'How wide the cracks are drawn, in pixels. The surface fades to black over this distance, so it is a softness as much as a width.'
		},
		roughness: {
			type: 'float',
			label: 'Roughness',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.5,
			description: 'How far the cracks lean and wander off the axis they were split on. 0 leaves every crack square to the frame, which reads as a tiled floor rather than a broken surface.'
		}
	};

	override properties: {
		seed: number | null;
		levels: number;
		jitter: number;
		width: number;
		roughness: number;
	};

	constructor(options: CrackulateOptions = {}) {
		super(options);
		this.properties = {
			seed: options.seed === undefined || options.seed === null ? null : Math.round(options.seed),
			levels: options.levels || 8,
			jitter: options.jitter ?? 0.7,
			width: options.width || 1.5,
			roughness: options.roughness ?? 0.5
		};
	}

	/** Smooth 1D value noise, -0.5 to 0.5. Twin of wobble() in the shader. */
	private static wobble(t: number, key: number): number {
		const i = Math.floor(t);
		let f = t - i;
		const a = (hash32((key ^ ((i + 4096) >>> 0)) >>> 0) >>> 8) / 16777216 - 0.5;
		const b = (hash32((key ^ ((i + 4097) >>> 0)) >>> 0) >>> 8) / 16777216 - 0.5;
		f = f * f * (3 - 2 * f);
		return a + (b - a) * f;
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const { levels, jitter, width, roughness } = this.properties;
		const seed = this.seed;

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				const hereX = x + 0.5;
				const hereY = y + 0.5;

				let loX = 0, loY = 0;
				let hiX = frame.width, hiY = frame.height;
				let path = seed >>> 0;
				let best = 1e9;

				for(let level = 0; level < levels; level++){
					const spanX = hiX - loX;
					const spanY = hiY - loY;
					const splitX = spanX >= spanY;

					path = hash32(path);
					const t = 0.5 + ((path >>> 8) / 16777216 - 0.5) * jitter * 0.8;
					const at = splitX ? loX + (hiX - loX)*t : loY + (hiY - loY)*t;

					//twin of the shader: the split stays on its axis for
					//bookkeeping and the drawn line leans and meanders off it
					const along = splitX ? hereY : hereX;
					const reach = splitX ? (hiY - loY) : (hiX - loX);
					const middle = splitX ? (loY + hiY)*0.5 : (loX + hiX)*0.5;

					const shape = hash32((path ^ 0xc2b2ae35) >>> 0);
					const lean = ((shape >>> 8)/16777216 - 0.5) * roughness * 1.4;
					const meander = Crackulate.wobble(along / Math.max(reach, 1) * 3, shape) * roughness * reach * 0.3;
					const line = at + lean*(along - middle) + meander;

					const across = splitX ? hereX : hereY;
					const away = Math.abs(across - line);
					if(away < best) best = away;

					if(across < line){
						if(splitX){ hiX = at; } else { hiY = at; }
						path = hash32((path ^ 0x9e3779b9) >>> 0);
					} else {
						if(splitX){ loX = at; } else { loY = at; }
						path = hash32((path ^ 0x85ebca6b) >>> 0);
					}
				}

				const value = Math.min(1, Math.max(0, best / Math.max(width, 0.5))) * 255;
				const at = (y*frame.width + x)*4;
				output.data[at] = output.data[at+1] = output.data[at+2] = value;
				output.data[at+3] = 255;
			}
		}

		return output;
	}
}
