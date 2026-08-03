//Noise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedRandom, seedFrom } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface NoiseOptions extends FilterOptions {
	intensity?: number;
	monochromatic?: boolean;
}

export class Noise extends Filter {
	//Fresh noise every call - caching it would freeze the grain.
	static override varying = true;

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
		intensity: { type: 'float', label: 'Intensity', min: 0, max: 100, step: 0.1, default: 1, description: 'Largest amount a channel can be pushed up or down.' },
		monochromatic: { type: 'bool', label: 'Monochromatic', default: false, description: 'Move all three channels together, so the grain is grey rather than coloured.' }
	};

	override properties: {
		intensity: number;
		monochromatic: boolean;
	};

	constructor(options: NoiseOptions = {}) {
		super(options);
		this.properties = {
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
		const seed = seedFrom(this.random);

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
