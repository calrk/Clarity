//Desaturate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface DesaturateOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class Desaturate extends Filter {
	constructor(options: DesaturateOptions = {}) {
		super(options);

	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let colour = this.getColourValue(frame, i, 'grey');

			output.data[i+0] = colour;
			output.data[i+1] = colour;
			output.data[i+2] = colour;
			output.data[i+3] = 255;
		}

		return output;
	}
}
