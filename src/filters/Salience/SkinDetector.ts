//Skin Detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface SkinDetectorOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class SkinDetector extends Filter {
	static override shader = /* glsl */ `
void main(){
	vec3 ycc = rgb2ycbcr(srcPixel(vUv).rgb);
	bool skin = ycc.x > 30.0
		&& ycc.y > 80.0 && ycc.y < 121.0
		&& ycc.z > 133.0 && ycc.z < 173.0;
	writeRGB(skin ? vec3(255.0) : vec3(0.0));
}
`;

	constructor(options: SkinDetectorOptions = {}) {
		super(options);

	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		this.RGBAtoYCbCr(output, frame);
		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			if(output.data[i] > 30 && 
					80 < output.data[i+1] && output.data[i+1] < 121 && 
					133 < output.data[i+2] && output.data[i+2] < 173){
				output.data[i+0] = 255;
				output.data[i+1] = 255;
				output.data[i+2] = 255;
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

	RGBAtoYCbCr(output: any, frame: ImageData) {
		let Y, Cb, Cr;
		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			Y = 16 + (66*frame.data[i] + 129*frame.data[i+1] + 25*frame.data[i+2])/256;
			Cb = 128 + (-38*frame.data[i] - 74*frame.data[i+1] + 112*frame.data[i+2])/256;
			Cr = 128 + (112*frame.data[i] - 94*frame.data[i+1] - 18*frame.data[i+2])/256;

			output.data[i] = Y;
			output.data[i+1] = Cb;
			output.data[i+2] = Cr;
		}
	}
}
