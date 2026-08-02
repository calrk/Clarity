//Dot Remover object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface DotRemoverOptions extends FilterOptions {
	neighboursReq?: number;
}

export class DotRemover extends Filter {
	static override shader = /* glsl */ `
uniform float u_neighboursReq;

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);

	if(p.x < 1 || p.y < 1 || p.x > size.x - 2 || p.y > size.y - 2){
		fragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	//compares the red channel, like the CPU does - this runs on binary images
	float col = srcTexel(p).r;
	float count = 0.0;
	if(srcTexel(p + ivec2(0, -1)).r == col) count += 1.0;
	if(srcTexel(p + ivec2(0,  1)).r == col) count += 1.0;
	if(srcTexel(p + ivec2(-1, 0)).r == col) count += 1.0;
	if(srcTexel(p + ivec2( 1, 0)).r == col) count += 1.0;

	if(count <= u_neighboursReq){
		writeRGB(col > 138.0 ? vec3(0.0) : vec3(255.0));
	}
	else{
		writeRGB(vec3(col));
	}
}
`;

	static override schema: FilterSchema = {
		neighboursReq: { type: 'int', label: 'Neighbours required', min: 1, max: 8, step: 1, default: 1, description: 'A lit pixel with fewer lit neighbours than this is removed.' }
	};

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
