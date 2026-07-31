//Contourer object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface ContourerOptions extends FilterOptions {
	contours?: number;
}

export class Contourer extends Filter {
	static override schema: FilterSchema = {
		contours: { type: 'int', label: 'Contours', min: 1, max: 20, step: 1, default: 10, description: 'How many height bands to split the map into.' }
	};

	override properties: {
		contours: number;
	};
	threshes!: number[];
	threshSets!: number[];
	difference!: number;
	maxValue!: number;
	minValue!: number;

	constructor(options: ContourerOptions = {}) {
		super(options);
		this.properties = {
			contours: options.contours || 10
		}

		this.threshes = [128, 256];
		this.threshSets = [0, 256];
		this.difference = 128;
		this.maxValue = 0;
		this.minValue = 255;
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//recomputed per frame - these used to persist between frames, so on video the
		//range only ever widened and the contours drifted
		this.maxValue = 0;
		this.minValue = 255;
		for(let i = 0; i < frame.data.length; i+=4){
			//separate ifs: `else if` meant a pixel could only ever update one of the two,
			//so the first pixel set the max and never the min
			if(frame.data[i] > this.maxValue){
				this.maxValue = frame.data[i];
			}
			if(frame.data[i] < this.minValue){
				this.minValue = frame.data[i];
			}
		}

		//a flat image gives difference 0, which made the loop in setVar run forever
		if(this.maxValue == this.minValue){
			return output;
		}
		this.setVar(this.properties.contours);

		for(let i = 0; i < frame.data.length; i++){
			if(!((i+1)%4 == 0)){
				for(let j = 0; j < this.threshes.length; j++){
					if(frame.data[i] < this.threshes[j]){
						output.data[i] = this.threshSets[j];
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

	setVar(newNo: any) {
		this.threshes = [];
		this.difference = (this.maxValue-this.minValue)/newNo;

		//`i` is read after the loop, which only worked because `var` hoisted it out
		//of the loop body. Declared here so the final band is still written.
		let index = 0;
		let i = this.difference+this.minValue;
		for(; i <= 256; i+= this.difference){
			this.threshes[index] = i;
			this.threshSets[index] = (i-this.difference-this.minValue)/(this.maxValue-this.minValue)*255;
			index ++;
		}
		this.threshes[index] = i;
		this.threshSets[index] = 255;
	}
}
