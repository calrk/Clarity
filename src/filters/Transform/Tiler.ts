//Tiler
//Tiles the image

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface TilerOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class Tiler extends Filter {
	constructor(options: TilerOptions = {}) {
		super(options);

	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let y = 0; y < frame.height; y+=2){
			for(let x = 0; x < frame.width; x+=2){
				let from1 = (y*frame.width + x)*4;
				let from2 = (y*frame.width + x+1)*4;
				let from3 = ((y+1)*frame.width + x)*4;
				let from4 = ((y+1)*frame.width + x+1)*4;

				//Top Left
				let toX = x/2;
				let toY = y/2;

				let to = (toY*frame.width + toX)*4;

				output.data[to] = frame.data[from1];
				output.data[to+1] = frame.data[from1+1];
				output.data[to+2] = frame.data[from1+2];
				output.data[to+3] = 255;

				//Top Right
				toX = frame.width - x/2-1;
				toY = y/2;
				to = (toY*frame.width + toX)*4;

				output.data[to] = frame.data[from2];
				output.data[to+1] = frame.data[from2+1];
				output.data[to+2] = frame.data[from2+2];
				output.data[to+3] = 255;

				//Bottom Left
				toX = x/2;
				toY = frame.height - y/2-1;
				to = (toY*frame.width + toX)*4;

				output.data[to] = frame.data[from3];
				output.data[to+1] = frame.data[from3+1];
				output.data[to+2] = frame.data[from3+2];
				output.data[to+3] = 255;

				//Bottom Right
				toX = frame.width - x/2-1;
				toY = frame.height - y/2-1;
				to = (toY*frame.width + toX)*4;

				output.data[to] = frame.data[from4];
				output.data[to+1] = frame.data[from4+1];
				output.data[to+2] = frame.data[from4+2];
				output.data[to+3] = 255;
			}
		}

		return output;
	}
}
