//Edge detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import { CHANNEL_FIELD } from '../../core/schema.js';
import type { FilterSchema } from '../../core/schema.js';

export interface EdgeDetectorOptions extends FilterOptions {
	fast?: boolean;
}

export class EdgeDetector extends Filter {
	static override shader = /* glsl */ `
uniform float u_fast;

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);

	//the CPU kernel skips a one-pixel border and leaves it black
	if(p.x < 1 || p.y < 1 || p.x > size.x - 2 || p.y > size.y - 2){
		fragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	if(u_fast > 0.5){
		float here = channelValue(srcTexel(p));
		float next = channelValue(srcTexel(p + ivec2(1, 0)));
		writeRGB(vec3(abs(next - here) * 5.0));
		return;
	}

	//3x3 with the centre at 8 and the ring at -1
	float sum = 8.0 * channelValue(srcTexel(p));
	for(int ky = -1; ky <= 1; ky++){
		for(int kx = -1; kx <= 1; kx++){
			if(kx == 0 && ky == 0) continue;
			sum -= channelValue(srcTexel(p + ivec2(kx, ky)));
		}
	}
	writeRGB(vec3(sum));
}
`;

	static override schema: FilterSchema = {
		fast: { type: 'bool', label: 'Fast', default: false, description: 'Two-sample difference instead of the 3x3 kernel.' },
		//The CPU path always honoured `channel`; the shader hardcoded luma, so
		//the two only agreed on the default. Declaring it here is what makes it
		//reachable from a control or a chain string at all.
		channel: CHANNEL_FIELD
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
