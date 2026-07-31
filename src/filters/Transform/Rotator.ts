//Rotator
//Rotates the image clockwise by the number of turns * 90 degrees
//If width/height are not the same, will crap the image to be square

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface RotatorOptions extends FilterOptions {
	turns?: number;
}

export class Rotator extends Filter {
	static override schema: FilterSchema = {
		turns: { type: 'int', label: 'Turns', min: 0, max: 3, step: 1, default: 0, description: 'Quarter turns clockwise.' }
	};

	override properties: {
		turns: number;
	};

	constructor(options: RotatorOptions = {}) {
		super(options);
		this.properties = {
			turns: options.turns || 0
		};

		while(this.properties.turns < 0){
			this.properties.turns += 4;
		}
		while(this.properties.turns >= 4){
			this.properties.turns -= 4;
		}
	}

	override doProcess(frame: ImageData): ImageData {
		if(this.properties.turns == 0){
			return frame;
		}
		let width = frame.width;
		let height = frame.height;
		let offset = 0;

		//&& binds tighter than ||, so this used to read `turns==1 || (turns==3 && w!=h)`
		if((this.properties.turns == 1 || this.properties.turns == 3) && frame.width != frame.height){
			let smallest = Operations.minimum([frame.width, frame.height]);
			if(smallest == frame.width){
				offset = Math.floor((frame.height-frame.width)/2);
				height = smallest;
			}
			else{
				offset = Math.floor((frame.width-frame.height)/2);
				width = smallest;
			}
		}

		let output = createImageData(frame.width, frame.height);

		for(let y = offset; y < height+offset; y++){
			for(let x = 0; x < width; x++){
				let from = ((y-offset)*frame.width + (x+offset))*4;
				let toX = 0;
				let toY = 0;
				//these used to be -y / -x and relied on the wrap below to bring them back
				//into range, which landed every result one pixel out
				if(this.properties.turns == 1){
					toX = frame.width-1-y;
					toY = x;
				}
				else if(this.properties.turns == 2){
					toX = frame.width-1-x;
					toY = frame.height-1-y;
				}
				else if(this.properties.turns == 3){
					toX = y;
					toY = frame.height-1-x;
				}
				//`>` let an index of exactly width/height through, wrapping onto the next row
				if(toX >= frame.width){
					toX -= frame.width;
				}
				else if(toX < 0){
					toX += frame.width;
				}
				if(toY >= frame.height){
					toY -= frame.height;
				}
				else if(toY < 0){
					toY += frame.height;
				}
				let to = ((toY)*frame.width + toX)*4;

				output.data[to] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];

				output.data[to+3] = 255;
			}
		}

		return output;
	}
}
