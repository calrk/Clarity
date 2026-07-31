//hsvShifter object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface hsvShifterOptions extends FilterOptions {
	hue?: number;
	saturation?: number;
	value?: number;
	/** Alias for {@link value}. */
	lightness?: number;
}

export class hsvShifter extends Filter {
	static override schema: FilterSchema = {
		hue: { type: 'float', label: 'Hue', min: 0, max: 360, step: 1, default: 0, description: 'Rotation in degrees.' },
		saturation: { type: 'float', label: 'Saturation', min: 0, max: 2, step: 0.1, default: 1 },
		value: { type: 'float', label: 'Value', min: 0, max: 2, step: 0.1, default: 1 }
	};

	override properties: {
		hue: number;
		saturation: number;
		value: number;
	};

	constructor(options: hsvShifterOptions = {}) {
		super(options);
		this.properties = {
			hue: options.hue || 0,
			saturation: options.saturation || 1,
			value: options.value || options.lightness || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let col = Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);

			col[0] += this.properties.hue;
			if(col[0] > 360){
				col[0] -= 360;
			}
			col[1] *= this.properties.saturation;
			col[2] *= this.properties.value;

			col = Operations.HSVtoRGB([col[0], col[1], col[2]]);

			output.data[i+0] = col[0];
			output.data[i+1] = col[1];
			output.data[i+2] = col[2];
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}
}
