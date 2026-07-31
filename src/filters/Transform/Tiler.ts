//Tiler
//Tiles the image

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface TilerOptions extends FilterOptions {
	/** No filter-specific options. */
}

/**
 * Mirrors the image into four quadrants, so opposite edges of the result match
 * and it can be tiled without a visible seam.
 */
export class Tiler extends Filter {
	constructor(options: TilerOptions = {}) {
		super(options);

	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//The old version scattered: it walked 2x2 source blocks and wrote each of
		//the four samples into a different quadrant. On an odd-sized frame that
		//broke twice over. Reading (x+1) on the last column ran off the end of the
		//row and wrapped onto the next one, and (y+1) on the last row ran off the
		//buffer entirely and read zeroes. On top of that the two halves both
		//landed on the middle row and column, so those got written twice - which
		//is the cross you could see straight down the centre.
		//
		//Gathering instead means every output pixel is computed exactly once from
		//a source position that is clamped into the frame, so odd sizes behave.
		const halfWidth = Math.ceil(frame.width/2);
		const halfHeight = Math.ceil(frame.height/2);

		for(let y = 0; y < frame.height; y++){
			//top half reads down the image, bottom half reads back up it, offset
			//by one so the two never sample the same row
			const sourceY = y < halfHeight
				? y*2
				: (frame.height-1-y)*2 + 1;
			const clampedY = Math.min(sourceY, frame.height-1);

			for(let x = 0; x < frame.width; x++){
				const sourceX = x < halfWidth
					? x*2
					: (frame.width-1-x)*2 + 1;
				const clampedX = Math.min(sourceX, frame.width-1);

				const from = (clampedY*frame.width + clampedX)*4;
				const to = (y*frame.width + x)*4;

				output.data[to  ] = frame.data[from  ];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];
				output.data[to+3] = 255;
			}
		}

		return output;
	}
}
