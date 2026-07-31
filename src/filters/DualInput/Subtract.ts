//Subtract object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface SubtractOptions extends FilterOptions {
	/** No filter-specific options. */
}

/**
 * Subtracts the second image from the first. Channels that go negative are
 * clamped to 0 by the underlying Uint8ClampedArray, so overlapping bright areas
 * crush to black.
 */
export class Subtract extends Filter {
	constructor(options: SubtractOptions = {}) {
		super(options);

	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i  ] = frame1.data[i  ] - frame2.data[i  ];
			output.data[i+1] = frame1.data[i+1] - frame2.data[i+1];
			output.data[i+2] = frame1.data[i+2] - frame2.data[i+2];
			output.data[i+3] = 255;
		}

		return output;
	}
}
