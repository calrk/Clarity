//FillHSV object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface FillHSVOptions extends FilterOptions {
	hue?: number;
	saturation?: number;
	value?: number;
	/** Alias for {@link value}. */
	lightness?: number;
}

export class FillHSV extends Filter {
	static override shader = /* glsl */ `
uniform float u_hue;
uniform float u_saturation;
uniform float u_value;

void main(){
	writeRGB(hsv2rgb(vec3(u_hue, u_saturation, u_value)));
}
`;

	static override schema: FilterSchema = {
		hue: { type: 'float', label: 'Hue', min: 0, max: 360, step: 1, default: 0, description: 'Position on the colour wheel, in degrees.' },
		saturation: { type: 'float', label: 'Saturation', min: 0, max: 1, step: 0.01, default: 0, description: 'How much colour. 0 is grey.' },
		value: { type: 'float', label: 'Value', min: 0, max: 1, step: 0.01, default: 0, description: 'Brightness. 0 is black.' }
	};

	override properties: {
		hue: number;
		saturation: number;
		value: number;
	};

	constructor(options: FillHSVOptions = {}) {
		super(options);
		this.properties = {
			hue: options.hue || 0,
			saturation: options.saturation || 0,
			value: options.value || options.lightness || 0
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		let col = Operations.HSVtoRGB([this.properties.hue, this.properties.saturation, this.properties.value]);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			output.data[i  ] = col[0];
			output.data[i+1] = col[1];
			output.data[i+2] = col[2];
			output.data[i+3] = 255;
		}

		return output;
	}
}
