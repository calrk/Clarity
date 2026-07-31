//Edge detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface EdgeDetectorOptions extends FilterOptions {
	fast?: boolean;
}

export class EdgeDetector extends Filter {
	static override schema: FilterSchema = {
		fast: { type: 'bool', label: 'Fast', default: false, description: 'Two-sample difference instead of the 3x3 kernel.' }
	};

	override properties: {
		fast: boolean;
	};
	kernel!: number[][];

	constructor(options: EdgeDetectorOptions = {}) {
		super(options);
		this.properties = {
			fast: options.fast || false
		}

		this.kernel = [ [ -1, -1, -1],
					   [ -1,  8, -1],
					   [ -1, -1, -1]];
		/*this.kernel = [ [ 0, 0, 0],
					   [ 0, 3, 0],
					   [ 0, 0, -3]];*/
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//the kernel loops skip a one pixel border, which would otherwise be left
		//fully transparent rather than black
		for(let a = 3; a < output.data.length; a += 4){
			output.data[a] = 255;
		}

		if(!this.properties.fast){
			for(let y = 4; y < frame.height*4-4; y+=4){
				for(let x = 4; x < frame.width*4-4; x+=4){
					let sum = 0; // Kernel sum for this pixel
					for(let ky = -1; ky <= 1; ky++){
						for(let kx = -1; kx <= 1; kx++){
							// Calculate the adjacent pixel for this kernel point
							let pos = (y + ky*4)*frame.width + (x + kx*4);
							// Image is grayscale, red/green/blue are identical
							let val = this.getColourValue(frame, pos);
							// Multiply adjacent pixels based on the kernel values
							sum += this.kernel[ky+1][kx+1] * val;
						}
					}
					output.data[y*frame.width + x] = sum;
					output.data[y*frame.width + x+1] = sum;
					output.data[y*frame.width + x+2] = sum;
					output.data[y*frame.width + x+3] = 255;
				}
			}
		}
		else{//a more fast edge detection, between 2 points only
			for(let y = 4; y < frame.height*4-4; y+=4){
				for(let x = 4; x < frame.width*4-4; x+=4){
					let i = y*frame.width + x;
					let diff = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
					output.data[i]   = diff;
					output.data[i+1] = diff;
					output.data[i+2] = diff;

					output.data[i+3] = 255;
				}
			}
		}

		return output;
	}
}
