//Dot Remover object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface DotRemoverOptions extends FilterOptions {
	neighboursReq?: number;
}

export class DotRemover extends Filter {
	override properties: {
		neighboursReq: number;
	};

	constructor(options: DotRemoverOptions = {}) {
		super(options);
		//was a bare `this.neighboursReq`, which the base class's setInt couldn't reach
		this.properties = {
			neighboursReq: options.neighboursReq || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//the loop skips a one pixel border, which would otherwise stay transparent
		for(let a = 3; a < output.data.length; a += 4){
			output.data[a] = 255;
		}

		for(let y = 1; y < frame.height - 1; y++){
			for(let x = 1; x < frame.width - 1; x++){
				let i = (y*frame.width + x)*4;

				let up = ((y-1)*frame.width + x)*4;
				let down = ((y+1)*frame.width + x)*4;
				let left = (y*frame.width + (x-1))*4;
				let right = (y*frame.width + (x+1))*4;

				let col = frame.data[i];
				let count = 0;
				if(frame.data[up] == col) count++;
				if(frame.data[down] == col) count++;
				if(frame.data[left] == col) count++;
				if(frame.data[right] == col) count++;

				if(count <= this.properties.neighboursReq){
					if(col > 138){
						output.data[i] = 0;
						output.data[i+1] = 0;
						output.data[i+2] = 0;
					}
					else{
						output.data[i] = 255;
						output.data[i+1] = 255;
						output.data[i+2] = 255;
					}
				}
				else{
					output.data[i] = col;
					output.data[i+1] = col;
					output.data[i+2] = col;
				}
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
