//Woodgrain object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedByte } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

/**
 * The eight directions a lattice corner's gradient can take, as the shader's
 * `dotGradient` spells them out. Integer components on purpose - see `Cloud`,
 * which uses the same eight for the same parity reason.
 */
const GX = new Float64Array([1, -1, 0, 0, 1, -1, 1, -1]);
const GY = new Float64Array([0, 0, 1, -1, 1, 1, -1, -1]);

/** Twin of the shader's LEAN: where in each cycle the sharp ring edge falls. */
const LEAN = 0.2;
/** Pixels the ring edge should span once the footprint decides it. */
const RAMP = 5;

export interface WoodgrainOptions extends FilterOptions {
	seed?: number | null;
	rings?: number;
	stretch?: number;
	turbulence?: number;
	grain?: number;
}

/**
 * Growth rings and grain, out of an empty frame.
 *
 * The third starter, and cheap for the reason `Voronoi` was: the hashed
 * gradient noise already exists and already agrees exactly on both backends, so
 * this is a coordinate function wrapped around a solved problem.
 *
 * The core is one line - `fract(distance across the grain + turbulence)` - and
 * the **sawtooth is the point**. A growth ring has a hard edge where the dense
 * late wood of one year meets the open early wood of the next, and `fract` is
 * what puts it there. Any smooth field gives ripples, which is the difference
 * between wood and water.
 *
 * **It is not a `Cloud` mode.** `fold` applies to the noise *value*, per octave;
 * rings apply to a *coordinate* that the noise then perturbs, which is a
 * different operation in a different place and no value-space fold can reach it.
 * Nor is it `Cloud` into `Contourer`: that bands by value, so a noise field
 * through it gives contour islands, and there is nowhere to say which way the
 * grain runs.
 *
 * **The anisotropy is the thing to get right.** Isotropic rings are end grain -
 * a tree stump, correct and not what anyone pictures. A plank is the same field
 * stretched hugely along the trunk, so `stretch` divides the noise's coordinate
 * along the grain rather than across it. It has to reach the *turbulence* and
 * not just the rings, or the rings elongate while the wobble stays round and the
 * result reads as fabric.
 *
 * Output is grey, following `Gradient`'s rule: colour is a `GradientMap` or a
 * multiply against a `Fill`, one more stage against several more properties
 * nobody sets, and a ramp there colours `Cloud` and `Contourer` too.
 *
 * Knots are the missing ingredient rather than a missing option. A knot is a
 * local singularity the ring field wraps around, which is `Voronoi`-shaped work,
 * and without one this reads as a board rather than as a particular board.
 */
export class Woodgrain extends Filter {
	static override shader = /* glsl */ `
uniform float u_rings;
uniform float u_stretch;
uniform float u_turbulence;
uniform float u_grain;

/**
 * One of eight fixed directions per lattice corner, dotted with the offset from
 * that corner - the whole of the difference between gradient and value noise.
 * Integer components keep the dot product exact on both backends; see Cloud.
 */
float dotGradient(int x, int y, int lane, float ox, float oy){
	int g = int(hashedByte(x, y, lane, uSeed)) & 7;
	if(g == 0) return ox;
	if(g == 1) return -ox;
	if(g == 2) return oy;
	if(g == 3) return -oy;
	if(g == 4) return ox + oy;
	if(g == 5) return oy - ox;
	if(g == 6) return ox - oy;
	return -ox - oy;
}

/** Gradient noise at an arbitrary point, quintic-faded. Roughly -1 to 1. */
float noiseAt(vec2 q, int lane){
	vec2 base = floor(q);
	ivec2 i = ivec2(base);
	vec2 f = q - base;

	//quintic rather than cubic, for the reason Cloud carries: cubic has a
	//discontinuous second derivative at every cell boundary, which is invisible
	//in the noise and very visible in anything that differentiates it
	vec2 w = f*f*f*(f*(f*6.0 - 15.0) + 10.0);

	float a = dotGradient(i.x,     i.y,     lane, f.x,       f.y);
	float b = dotGradient(i.x + 1, i.y,     lane, f.x - 1.0, f.y);
	float c = dotGradient(i.x,     i.y + 1, lane, f.x,       f.y - 1.0);
	float d = dotGradient(i.x + 1, i.y + 1, lane, f.x - 1.0, f.y - 1.0);

	return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

/** Three octaves of it, halving each time. */
float fbm(vec2 q, int lane){
	return noiseAt(q, lane)
		+ noiseAt(q * 2.0, lane + 1) * 0.5
		+ noiseAt(q * 4.0, lane + 2) * 0.25;
}

/** Which ring we are on, and how far through it. Whole numbers are ring lines. */
float phase(vec2 uv){
	//Along the grain is x, across it is y, and dividing x by the stretch is the
	//whole anisotropy - it has to reach the noise as well as the rings, or the
	//rings elongate while the wobble stays round and it reads as fabric.
	vec2 q = vec2(uv.x / u_stretch, uv.y) * u_rings;

	//Distance from the trunk's axis, squashed the same way. Squashing rather
	//than merely scaling is what lets one control cover both cuts: at a stretch
	//of 1 this is a circle and the rings come out concentric, which is end grain
	//- a stump. Wind it up and the circle flattens into the long shallow arcs of
	//a flat-sawn plank, which is the cathedral figure down the middle of a board.
	vec2 fromAxis = uv - vec2(0.5);
	return length(vec2(fromAxis.x / u_stretch, fromAxis.y)) * u_rings
		+ fbm(q, 0) * u_turbulence;
}

void main(){
	vec2 p = vec2(outPixel()) + 0.5;
	vec2 uv = p / uSize;
	vec2 texel = 1.0 / uSize;

	float d = phase(uv);

	//How much of a ring a single pixel spans - the footprint, and the whole of
	//what makes this not alias.
	//
	//Turbulence is what makes it necessary. The rings alone move slowly enough
	//to resolve, but the noise perturbing them has a far steeper gradient, so
	//where it bunches the rings together a whole cycle can fall inside two or
	//three pixels and a fixed-width ring edge is then sub-pixel.
	//
	//A forward difference rather than fwidth: the derivative builtins exist only
	//in a fragment shader, and the CPU path has to compute the identical number
	//or the two backends disagree along every ring. It costs two more evaluations
	//of the field, which is cheap for something that draws once.
	float width = max(
		abs(phase(uv + vec2(texel.x, 0.0)) - d),
		abs(phase(uv + vec2(0.0, texel.y)) - d)
	);

	float ring = fract(d);

	//An asymmetric triangle rather than the sawtooth itself, and this is what
	//keeps the ring edge from aliasing.
	//
	//fract is discontinuous: shaping it directly falls smoothly to black and
	//then snaps back to white in the space of one pixel, which is a full-range
	//step with nothing to soften it. Folding the cycle into a triangle first
	//makes the field continuous everywhere - it reaches its peak *at* the wrap
	//and comes back down, so there is no step left to alias.
	//
	//The fold is off-centre on purpose. A symmetric triangle gives a ring shaded
	//equally on both sides, and a real one is abrupt where the dense late wood
	//of one year meets the open early wood of the next and gradual the other
	//way. LEAN is where in the cycle that edge falls; the short side is the
	//sharp one.
	//
	//It also antialiases *proportionally*, which is the reason this beats
	//smoothing by a fixed width: the ramp is a fraction of a ring rather than a
	//number of pixels, so it stays smooth where the rings crowd together and
	//stays sharp where they are far apart, with nothing to measure.
	//Never narrower than the pixel it has to be drawn in. Below that the ramp is
	//the width it was authored at; above it, it opens up to match the footprint,
	//which is the difference between a stepped edge and a soft one.
	const float LEAN = 0.2;
	const float RAMP = 5.0;
	float lean = clamp(width * RAMP, LEAN, 0.5);
	float t = ring < lean ? ring / lean : (1.0 - ring) / (1.0 - lean);

	//Dark at the ring line, pale across the year's growth - and smoothstep rather
	//than a cube, which is the last of the three things this needed. A cube has
	//slope 3 where it meets the ring line, so it crams most of the fall into the
	//end of the ramp and steps there however wide the ramp is; smoothstep is flat
	//at both ends and halves the steepest slope.
	float tone = 1.0 - t*t*(3.0 - 2.0*t);

	//And where a whole ring falls inside a pixel there is nothing left to
	//resolve at all, so fade to the tone a ring averages rather than letting it
	//flicker between light and dark. That average is 0.75 whatever the lean is,
	//which is why it can be a constant.
	tone = mix(0.75, tone, clamp(1.0 - width * 2.0, 0.0, 1.0));

	//The second scale, and it multiplies rather than subtracting. One field only
	//gives the rings, and it is the fine pore lines along the grain that stop it
	//looking like a contour map - but subtracting drives the already-dark bands
	//below zero, where they clamp into flat black blobs. Scaling keeps the pores
	//proportional, so they show on the pale early wood and leave the ring alone,
	//which is also where they are on a real board.
	vec2 q = vec2(uv.x / u_stretch, uv.y) * u_rings;
	tone *= 1.0 - u_grain * abs(noiseAt(q * vec2(3.0, 24.0), 9));

	writeRGB(vec3(clamp(tone, 0.0, 1.0) * 255.0));
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
			description: 'Which board. Left empty it picks one when the filter is made and keeps it; set, the same number always gives the same grain - which is what makes a link reproduce.'
		},
		rings: {
			type: 'int',
			label: 'Rings',
			min: 1,
			max: 64,
			step: 1,
			default: 14,
			description: 'How many growth rings across the frame. More is a smaller, older tree, or a wider board.'
		},
		stretch: {
			type: 'float',
			label: 'Stretch',
			min: 1,
			max: 30,
			step: 0.5,
			default: 8,
			description: 'How far the grain is drawn out along the board. 1 is end grain - concentric, like a stump - and anything high is a plank cut down the trunk.'
		},
		turbulence: {
			type: 'float',
			label: 'Turbulence',
			min: 0,
			max: 3,
			step: 0.05,
			default: 0.7,
			description: 'How far the rings wander from straight. 0 gives perfect stripes, which no tree has ever produced.'
		},
		grain: {
			type: 'float',
			label: 'Grain',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.3,
			description: 'The fine pore lines running along the grain, on top of the rings. Without them it reads as a contour map rather than as timber.'
		}
	};

	override properties: {
		seed: number | null;
		rings: number;
		stretch: number;
		turbulence: number;
		grain: number;
	};

	constructor(options: WoodgrainOptions = {}) {
		super(options);
		this.properties = {
			seed: options.seed === undefined || options.seed === null ? null : Math.round(options.seed),
			rings: options.rings || 14,
			stretch: options.stretch === undefined ? 8 : options.stretch,
			//a deliberate 0 is meaningful - dead straight rings - so not `||`
			turbulence: options.turbulence === undefined ? 0.7 : options.turbulence,
			grain: options.grain === undefined ? 0.3 : options.grain
		};
	}

	/** Twin of the shader's, down to the eight directions and the quintic. */
	private noiseAt(qx: number, qy: number, lane: number, seed: number): number {
		const baseX = Math.floor(qx);
		const baseY = Math.floor(qy);
		const fx = qx - baseX;
		const fy = qy - baseY;

		const wx = fx*fx*fx*(fx*(fx*6 - 15) + 10);
		const wy = fy*fy*fy*(fy*(fy*6 - 15) + 10);

		const g00 = hashedByte(baseX,     baseY,     lane, seed) & 7;
		const g10 = hashedByte(baseX + 1, baseY,     lane, seed) & 7;
		const g01 = hashedByte(baseX,     baseY + 1, lane, seed) & 7;
		const g11 = hashedByte(baseX + 1, baseY + 1, lane, seed) & 7;

		const a = GX[g00]*fx       + GY[g00]*fy;
		const b = GX[g10]*(fx - 1) + GY[g10]*fy;
		const c = GX[g01]*fx       + GY[g01]*(fy - 1);
		const d = GX[g11]*(fx - 1) + GY[g11]*(fy - 1);

		const top = a + (b - a)*wx;
		const bottom = c + (d - c)*wx;
		return top + (bottom - top)*wy;
	}

	private fbm(qx: number, qy: number, lane: number, seed: number): number {
		return this.noiseAt(qx, qy, lane, seed)
			+ this.noiseAt(qx*2, qy*2, lane + 1, seed) * 0.5
			+ this.noiseAt(qx*4, qy*4, lane + 2, seed) * 0.25;
	}

	/** Twin of the shader's: which ring, and how far through it. */
	private phase(ux: number, uy: number, seed: number): number {
		const { rings, stretch, turbulence } = this.properties;

		//see the shader: dividing along the grain is the whole anisotropy
		const qx = (ux / stretch) * rings;
		const qy = uy * rings;

		//squashed distance from the trunk's axis - a circle at stretch 1
		const fromX = (ux - 0.5) / stretch;
		const fromY = uy - 0.5;

		return Math.sqrt(fromX*fromX + fromY*fromY) * rings
			+ this.fbm(qx, qy, 0, seed)*turbulence;
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;
		const seed = this.seed;
		const { rings, stretch, grain } = this.properties;

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const ux = (x + 0.5) / width;
				const uy = (y + 0.5) / height;

				const d = this.phase(ux, uy, seed);

				//the same forward difference the shader takes, so the two agree
				//along every ring rather than only between them
				const footprint = Math.max(
					Math.abs(this.phase(ux + 1/width, uy, seed) - d),
					Math.abs(this.phase(ux, uy + 1/height, seed) - d)
				);

				const ring = d - Math.floor(d);

				//see the shader: the fold plus a ramp never narrower than a pixel
				const lean = Math.min(0.5, Math.max(LEAN, footprint * RAMP));
				const t = ring < lean ? ring / lean : (1 - ring) / (1 - lean);
				let tone = 1 - t*t*(3 - 2*t);

				//nothing to resolve below a pixel; 0.75 is a ring's mean tone
				const resolved = Math.min(1, Math.max(0, 1 - footprint*2));
				tone = 0.75 + (tone - 0.75)*resolved;

				const qx = (ux / stretch) * rings;
				const qy = uy * rings;
				tone *= 1 - grain * Math.abs(this.noiseAt(qx*3, qy*24, 9, seed));

				const value = Math.min(1, Math.max(0, tone)) * 255;
				const i = (y*width + x)*4;
				output.data[i  ] = value;
				output.data[i+1] = value;
				output.data[i+2] = value;
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
