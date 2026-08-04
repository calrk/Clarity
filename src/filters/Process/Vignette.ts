//Vignette object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface VignetteOptions extends FilterOptions {
	amount?: number;
	radius?: number;
	softness?: number;
}

/**
 * Darkens towards the corners.
 *
 * This is a `Gradient` radial multiplied over the source, and it exists as its
 * own filter anyway because that composition needs a two-input stage fed from
 * the source, which is a stage option rather than anything the chain format can
 * currently say - so the useful version would not fit in a link.
 *
 * Distance is normalised by half the diagonal, so a radius of 1 is exactly the
 * corner and the falloff is circular in pixel space rather than stretched with
 * the aspect ratio. Alpha is carried through: a vignette is a light effect, not
 * a mask, and forcing it opaque would quietly discard transparency.
 */
export class Vignette extends Filter {
	static override shader = /* glsl */ `
uniform float u_amount;
uniform float u_radius;
uniform float u_softness;

void main(){
	ivec2 p = outPixel();
	vec2 centre = uSize * 0.5;
	float r = length(vec2(p) + 0.5 - centre) / length(centre);

	//smoothstep needs its edges apart; a softness of zero is a hard circle
	float edge = max(u_radius + u_softness, u_radius + 0.0001);
	float fall = smoothstep(u_radius, edge, r);

	vec4 c = srcPixel(vUv);
	writePixel(vec4(c.rgb * (1.0 - u_amount * fall), c.a));
}
`;

	static override schema: FilterSchema = {
		amount: { type: 'float', label: 'Amount', min: 0, max: 1, step: 0.05, default: 0.6, description: 'How dark it gets at the outside. 1 is black.' },
		radius: { type: 'float', label: 'Radius', min: 0, max: 1.5, step: 0.05, default: 0.5, description: 'Where the darkening starts, with 1 being the corner.' },
		softness: { type: 'float', label: 'Softness', min: 0, max: 1.5, step: 0.05, default: 0.5, description: 'How far it takes to fade in. Zero gives a hard circle.' }
	};

	override properties: {
		amount: number;
		radius: number;
		softness: number;
	};

	constructor(options: VignetteOptions = {}) {
		super(options);
		this.properties = {
			amount: options.amount === undefined ? 0.6 : options.amount,
			radius: options.radius === undefined ? 0.5 : options.radius,
			softness: options.softness === undefined ? 0.5 : options.softness
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;
		const { amount, radius, softness } = this.properties;

		const centreX = width * 0.5;
		const centreY = height * 0.5;
		const half = Math.sqrt(centreX*centreX + centreY*centreY);
		const edge = Math.max(radius + softness, radius + 0.0001);

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const dx = x + 0.5 - centreX;
				const dy = y + 0.5 - centreY;
				const r = Math.sqrt(dx*dx + dy*dy) / half;

				//the same curve smoothstep uses, so the two backends agree
				const t = Math.min(1, Math.max(0, (r - radius) / (edge - radius)));
				const fall = t*t*(3 - 2*t);
				const keep = 1 - amount*fall;

				const i = (y*width + x)*4;
				output.data[i  ] = frame.data[i  ] * keep;
				output.data[i+1] = frame.data[i+1] * keep;
				output.data[i+2] = frame.data[i+2] * keep;
				output.data[i+3] = frame.data[i+3];
			}
		}

		return output;
	}
}
