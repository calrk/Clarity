//Blend object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface BlendOptions extends FilterOptions {
	ratio?: number;
}

export class Blend extends Filter {
	static override schema: FilterSchema = {
		ratio: { type: 'float', label: 'Ratio', min: 0, max: 1, step: 0.01, default: 0.5, description: '0 is all of the first image, 1 is all of the second.' }
	};

	override properties: {
		ratio: number;
	};

	constructor(options: BlendOptions = {}) {
		super(options);
		//`clamp(...) || 0.5` turned a deliberate ratio of 0 back into 0.5
		this.properties = {
			ratio: Operations.clamp(options.ratio === undefined ? 0.5 : options.ratio, 0, 1)
		};
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i+0] = frame1.data[i  ]*this.properties.ratio + frame2.data[i  ]*(1-this.properties.ratio);
			output.data[i+1] = frame1.data[i+1]*this.properties.ratio + frame2.data[i+1]*(1-this.properties.ratio);
			output.data[i+2] = frame1.data[i+2]*this.properties.ratio + frame2.data[i+2]*(1-this.properties.ratio);
			output.data[i+3] = 255;
		}

		return output;
	}
}
