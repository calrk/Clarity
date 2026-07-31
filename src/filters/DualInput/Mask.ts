//Mask object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface MaskOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class Mask extends Filter {
	constructor(options: MaskOptions = {}) {
		super(options);

	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			if(frame2.data[i] < 128){
				output.data[i+0] = frame1.data[i  ];
				output.data[i+1] = frame1.data[i+1];
				output.data[i+2] = frame1.data[i+2];
			}
			else{
				output.data[i+0] = 0;
				output.data[i+1] = 0;
				output.data[i+2] = 0;
			}
			output.data[i+3] = 255;
		}

		return output;
	}
}
