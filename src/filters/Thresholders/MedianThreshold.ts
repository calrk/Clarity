//Median Threshold object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface MedianThresholdOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class MedianThreshold extends Filter {
	threshes?: any;

	constructor(options: MedianThresholdOptions = {}) {
		super(options);
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//gets the threshold value
		this.threshes = this.getThresholdValues(frame);
		this.threshes.push(256);
		//performs the thresholding on the data
		for(let i = 0; i < frame.data.length; i++){
			if(!((i+1)%4 == 0)){
				for(let j = 0; j < this.threshes.length; j++){
					if(frame.data[i] < this.threshes[j]){
						output.data[i] = this.threshes[j];
						break;
					}
				}
			}
			else{
				output.data[i] = 255;
			}
		}

		return output;
	}

	getThresholdValues(data: any) {
		let values = new Array();
		let median = [0,0,0];

		for(let i = 0; i < 256; i++){
			values[i] = 0;
		}

		for(let i = 0; i < data.data.length; i+=4){
			// if(data.data[i] != 0)
				values[data.data[i]] ++;
		}

		let cumulative = 0;
		let maximum = data.data.length/4/4;
		let pos = 0;
		for(let i = 0; i < 256; i++){
			cumulative += values[i];
			if(cumulative > maximum){
				maximum += data.data.length/4/4;
				median[pos] = i;
				pos++;
			}
		}

		return median;
	}
}
