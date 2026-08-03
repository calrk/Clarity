//Sharpen object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface SharpenOptions extends FilterOptions {
	intensity?: number;
}

export class Sharpen extends Filter {
	static override shader = /* glsl */ `
uniform float u_intensity;

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);

	if(p.x < 1 || p.y < 1 || p.x > size.x - 2 || p.y > size.y - 2){
		fragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	//kernel is -intensity on the ring, 8*intensity+1 in the centre
	vec3 sum = (8.0 * u_intensity + 1.0) * srcTexel(p).rgb;
	for(int ky = -1; ky <= 1; ky++){
		for(int kx = -1; kx <= 1; kx++){
			if(kx == 0 && ky == 0) continue;
			sum -= u_intensity * srcTexel(p + ivec2(kx, ky)).rgb;
		}
	}
	writeRGB(sum);
}
`;

	static override schema: FilterSchema = {
		intensity: { type: 'float', label: 'Intensity', min: 0, max: 3, step: 0.1, default: 1, description: 'How much local contrast to add. 0 leaves the image untouched.' }
	};

	override properties: {
		intensity: number;
	};
	kernel!: number[][];

	constructor(options: SharpenOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 1
		};

		this.makeKernel(this.properties.intensity);
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//the kernel loop skips a one pixel border, which would otherwise be left
		//fully transparent rather than black
		for(let a = 3; a < output.data.length; a += 4){
			output.data[a] = 255;
		}

		for(let y = 4; y < frame.height*4-4; y+=4){
			for(let x = 4; x < frame.width*4-4; x+=4){
				let sumr = 0;
				let sumg = 0;
				let sumb = 0;
				for(let ky = -1; ky <= 1; ky++){
					for(let kx = -1; kx <= 1; kx++){
						let pos = (y + ky*4)*frame.width + (x + kx*4);

						let valr = this.getColourValue(frame, pos, 'red');
						let valg = this.getColourValue(frame, pos, 'green');
						let valb = this.getColourValue(frame, pos, 'blue');

						sumr += this.kernel[ky+1][kx+1] * valr;
						sumg += this.kernel[ky+1][kx+1] * valg;
						sumb += this.kernel[ky+1][kx+1] * valb;
					}
				}
				output.data[y*frame.width + x]   = sumr;
				output.data[y*frame.width + x+1] = sumg;
				output.data[y*frame.width + x+2] = sumb;
				output.data[y*frame.width + x+3] = 255;
			}
		}

		return output;
	}

	//The kernel is derived from `intensity`, so it has to be rebuilt when that
	//changes. This used to sit in the slider's change handler, which meant
	//setting `intensity` any other way left the kernel at its old value and the
	//filter quietly ignored the change.
	override propertyChanged(key: string): void {
		if(key === 'intensity'){
			this.makeKernel(this.properties.intensity);
		}
	}

	makeKernel(intensity: number): void {
		this.kernel = [ [ -intensity, -intensity, -intensity],
					    [ -intensity,  8*intensity+1, -intensity],
					    [ -intensity, -intensity, -intensity]];
	}
}
