//NormalFlip object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface NormalFlipOptions extends FilterOptions {
	red?: boolean;
	green?: boolean;
	swap?: boolean;
}

export class NormalFlip extends Filter {
	static override shader = /* glsl */ `
uniform float u_red;
uniform float u_green;
uniform float u_swap;

void main(){
	vec4 c = srcPixel(vUv);
	float r = u_red   > 0.5 ? 255.0 - c.r : c.r;
	float g = u_green > 0.5 ? 255.0 - c.g : c.g;
	if(u_swap > 0.5){
		float t = r; r = g; g = t;
	}
	writeRGB(vec3(r, g, c.b));
}
`;

	static override schema: FilterSchema = {
		red: { type: 'bool', label: 'Flip X', default: false, description: 'Negates the X component, in the red channel. Use it when lighting comes out mirrored left to right.' },
		green: { type: 'bool', label: 'Flip Y', default: false, description: 'Negates the Y component, in the green channel. This is the OpenGL/DirectX normal map difference.' },
		swap: { type: 'bool', label: 'Swap X/Y', default: false, description: 'Exchanges the X and Y components, for a map generated with the axes transposed.' }
	};

	override properties: {
		red: boolean;
		green: boolean;
		swap: boolean;
	};

	constructor(options: NormalFlipOptions = {}) {
		super(options);
		this.properties = {
			red: options.red || false,
			green: options.green || false,
			swap: options.swap || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			if(this.properties.red){
				output.data[i] = 255-frame.data[i];
			}
			else{
				output.data[i] = frame.data[i];
			}

			if(this.properties.green){
				output.data[i+1] = 255-frame.data[i+1];
			}
			else{
				output.data[i+1] = frame.data[i+1];
			}

			if(this.properties.swap){
				let temp = output.data[i];
				output.data[i] = output.data[i+1];
				output.data[i+1] = temp;
			}

			output.data[i+2] = frame.data[i+2];
			output.data[i+3] = 255;
		}

		return output;
	}
}
