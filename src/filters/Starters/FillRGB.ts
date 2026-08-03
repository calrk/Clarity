//FillRGB object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface FillRGBOptions extends FilterOptions {
	red?: number;
	green?: number;
	blue?: number;
}

export class FillRGB extends Filter {
	static override shader = /* glsl */ `
uniform float u_red;
uniform float u_green;
uniform float u_blue;

void main(){
	writeRGB(vec3(u_red, u_green, u_blue));
}
`;

	static override schema: FilterSchema = {
		red: { type: 'int', label: 'Red', min: 0, max: 255, step: 1, default: 0, description: 'Red channel of the fill colour.' },
		green: { type: 'int', label: 'Green', min: 0, max: 255, step: 1, default: 0, description: 'Green channel of the fill colour.' },
		blue: { type: 'int', label: 'Blue', min: 0, max: 255, step: 1, default: 0, description: 'Blue channel of the fill colour.' }
	};

	override properties: {
		red: number;
		green: number;
		blue: number;
	};

	constructor(options: FillRGBOptions = {}) {
		super(options);
		this.properties = {
			red: options.red || 0,
			green: options.green || 0,
			blue: options.blue || 0
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		        // color: Math.floor(Math.random()*16777215).toString(16)

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			output.data[i  ] = this.properties.red;
			output.data[i+1] = this.properties.green;
			output.data[i+2] = this.properties.blue;
			output.data[i+3] = 255;
		}

		return output;
	}
}
