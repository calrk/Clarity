//NormalIntensity object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface NormalIntensityOptions extends FilterOptions {
	intensity?: number;
}

export class NormalIntensity extends Filter {
	static override shader = /* glsl */ `
uniform float u_intensity;

vec3 normalise(vec3 v){
	//the CPU takes sqrt(abs(dot)), which only differs for a zero vector
	float mag = sqrt(abs(dot(v, v)));
	return v / mag;
}

void main(){
	vec4 c = srcPixel(vUv);
	//all three channels are [-1,1] over 0-255, matching NormalGenerator - blue
	//used to be read as [0,1] here, which agreed with what that filter wrote
	//and with nothing else
	vec3 v = vec3((c.r - 128.0) / 128.0, (c.g - 128.0) / 128.0, (c.b - 128.0) / 128.0);

	v = normalise(v);
	v.xy *= u_intensity;
	v = normalise(v);

	writeRGB(vec3((v.x + 1.0) * 128.0, (v.y + 1.0) * 128.0, (v.z + 1.0) * 128.0));
}
`;

	static override schema: FilterSchema = {
		intensity: { type: 'float', label: 'Intensity', min: 0, max: 2, step: 0.1, default: 0.5, description: 'Below 1 flattens the normal, above 1 exaggerates it.' }
	};

	override properties: {
		intensity: number;
	};

	constructor(options: NormalIntensityOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 0.5
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				let vector = {  x: (frame.data[i  ]-128)/128,
								y: (frame.data[i+1]-128)/128,
								z: (frame.data[i+2]-128)/128
							 };

				vector = this.normalise(vector);
				vector.x *= this.properties.intensity;
				vector.y *= this.properties.intensity;
				vector = this.normalise(vector);

				output.data[i] =   (vector.x+1)*128;
				output.data[i+1] = (vector.y+1)*128;
				output.data[i+2] = (vector.z+1)*128;

				output.data[i+3] = 255;
			}
		}

		return output;
	}

	normalise(v: any) {
		let mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
		return{
			x: v.x/mag,
			y: v.y/mag,
			z: v.z/mag
		}
	}
}
