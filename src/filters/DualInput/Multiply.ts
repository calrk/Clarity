//Multiply object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface MultiplyOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class Multiply extends Filter {
	static override shader = /* glsl */ `
void main(){
	vec3 a = srcPixel(vUv).rgb;
	vec3 b = src2Pixel(vUv).rgb;
	writeRGB(a * b / 255.0);
}
`;

	constructor(options: MultiplyOptions = {}) {
		super(options);
		/*this.properties = {
			ratio: Operations.clamp(options.ratio, 0, 1) || 0.5
		};*/
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i+0] = ((frame1.data[i  ]/255) * (frame2.data[i  ])/255)*255;
			output.data[i+1] = ((frame1.data[i+1]/255) * (frame2.data[i+1])/255)*255;
			output.data[i+2] = ((frame1.data[i+2]/255) * (frame2.data[i+2])/255)*255;
			output.data[i+3] = 255;
		}

		return output;
	}
}
