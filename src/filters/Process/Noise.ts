//Noise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedRandom } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface NoiseOptions extends FilterOptions {
	seed?: number | null;
	intensity?: number;
	monochromatic?: boolean;
}

export class Noise extends Filter {
	//Pure, now that the seed is fixed per instance rather than drawn on every
	//call. It used to be varying, which meant a single Cloud produced a new
	//field every time it ran - invisible while a still rendered once, and a
	//strobe as soon as anything drove a loop. See Filter.seed.

	static override shader = /* glsl */ `
uniform float u_intensity;
uniform float u_monochromatic;

void main(){
	ivec2 p = outPixel();
	vec3 c = srcPixel(vUv).rgb;

	//lane 0 for all three channels when monochromatic, so they move together
	vec3 amount = vec3(
		hashedRandom(p.x, p.y, 0, uSeed),
		hashedRandom(p.x, p.y, u_monochromatic > 0.5 ? 0 : 1, uSeed),
		hashedRandom(p.x, p.y, u_monochromatic > 0.5 ? 0 : 2, uSeed)
	);
	vec3 offset = (amount - 0.5) * 2.0 * u_intensity;

	//the monochromatic path rounds its single offset to a whole number before
	//adding it, so the three channels stay exactly in step
	if(u_monochromatic > 0.5){
		offset = vec3(floor(offset.r + 0.5));
	}

	writeRGB(c + offset);
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
			description: 'Which grain. Left empty it picks one when the filter is made and keeps it; set, the same number always gives the same result - which is what makes a link reproduce.'
		},
		intensity: { type: 'float', label: 'Intensity', min: 0, max: 100, step: 0.1, default: 1, description: 'Largest amount a channel can be pushed up or down.' },
		monochromatic: { type: 'bool', label: 'Monochromatic', default: false, description: 'Move all three channels together, so the grain is grey rather than coloured.' }
	};

	override properties: {
		seed: number | null;
		intensity: number;
		monochromatic: boolean;
	};

	constructor(options: NoiseOptions = {}) {
		super(options);
		this.properties = {
			seed: options.seed === undefined || options.seed === null ? null : Math.round(options.seed),
			intensity: options.intensity || 1,
			monochromatic: options.monochromatic || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//One draw per frame, hashed per pixel from there. It used to take one draw
		//per channel per pixel, in whatever order the loop happened to run - which
		//a shader cannot reproduce, because fragments have no order. See
		//src/helpers/hash.ts.
		const seed = this.seed;

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				if(this.properties.monochromatic){
					let offset = Math.round(2*(hashedRandom(x, y, 0, seed)-0.5)*this.properties.intensity);
					output.data[i  ] = frame.data[i  ] + offset;
					output.data[i+1] = frame.data[i+1] + offset;
					output.data[i+2] = frame.data[i+2] + offset;
				}
				else{
					for(let c = 0; c < 3; c++){
						output.data[i+c] = frame.data[i+c] + 2*(hashedRandom(x, y, c, seed)-0.5)*this.properties.intensity;
					}
				}

				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
