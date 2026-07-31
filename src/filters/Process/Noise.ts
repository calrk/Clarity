//Noise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface NoiseOptions extends FilterOptions {
	intensity?: number;
	monochromatic?: boolean;
}

export class Noise extends Filter {
	static override schema: FilterSchema = {
		intensity: { type: 'float', label: 'Intensity', min: 0, max: 100, step: 0.1, default: 1 },
		monochromatic: { type: 'bool', label: 'Monochromatic', default: false }
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

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			if(this.properties.monochromatic){
				let random = Math.round(2*(this.random()-0.5)*this.properties.intensity);
				// let col = Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
				// col[2] += Operations.clamp((this.random()-0.5)*2, 0, 1);
				// col = Operations.HSVtoRGB([col[0], col[1], col[2]]);
				output.data[i  ] = frame.data[i  ] + random;
				output.data[i+1] = frame.data[i+1] + random;
				output.data[i+2] = frame.data[i+2] + random;
			}
			else{
				output.data[i  ] = frame.data[i  ] + 2*(this.random()-0.5)*this.properties.intensity;
				output.data[i+1] = frame.data[i+1] + 2*(this.random()-0.5)*this.properties.intensity;
				output.data[i+2] = frame.data[i+2] + 2*(this.random()-0.5)*this.properties.intensity;
			}

			output.data[i+3] = 255;
		}

		return output;
	}
}
