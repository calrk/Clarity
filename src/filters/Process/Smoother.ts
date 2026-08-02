//Smoother object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface SmootherOptions extends FilterOptions {
	iterations?: number;
}

export class Smoother extends Filter {
	static override shader = [
		{
			source: /* glsl */ `
void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);

	vec3 sum = vec3(0.0);
	float count = 0.0;

	//the CPU averages only the neighbours that exist, so edge pixels divide by
	//three and corners by two
	if(p.x != 0)          { sum += srcTexel(p + ivec2(-1, 0)).rgb; count += 1.0; }
	if(p.x != size.x - 1) { sum += srcTexel(p + ivec2( 1, 0)).rgb; count += 1.0; }
	if(p.y != 0)          { sum += srcTexel(p + ivec2(0, -1)).rgb; count += 1.0; }
	if(p.y != size.y - 1) { sum += srcTexel(p + ivec2(0,  1)).rgb; count += 1.0; }

	writeRGB(sum / count);
}
`,
			repeat: (filter: Filter) => Math.max(1, Number(filter.properties.iterations))
		}
	];

	static override schema: FilterSchema = {
		iterations: { type: 'int', label: 'Iterations', min: 1, max: 5, step: 1, default: 1 }
	};

	override properties: {
		iterations: number;
	};
	distance!: any;

	constructor(options: SmootherOptions = {}) {
		super(options);
		// this.distance = options.distance || 1;
		this.properties = {
			iterations: options.iterations || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		//each pass now reads the previous pass's output. Before, every iteration read
		//`frame` and wrote the same buffer, so iterations > 1 recomputed an identical
		//result and the control did nothing.
		let source = frame;
		let output = frame;

		for(let z = 0; z < this.properties.iterations; z++){
			output = createImageData(frame.width, frame.height);

			for(let y = 0; y < frame.height; y++){
				for(let x = 0; x < frame.width; x++){
					let i = (y*frame.width + x)*4;

					let up = ((y-1)*frame.width + x)*4;
					let down = ((y+1)*frame.width + x)*4;
					let left = (y*frame.width + (x-1))*4;
					let right = (y*frame.width + (x+1))*4;

					let count = 0;
					let col = [0, 0, 0];

					if(x != 0){
						col[0] += source.data[left];
						col[1] += source.data[left+1];
						col[2] += source.data[left+2];
						count ++;
					}
					if(x != frame.width-1){
						col[0] += source.data[right];
						col[1] += source.data[right+1];
						col[2] += source.data[right+2];
						count ++;
					}
					if(y != 0){
						col[0] += source.data[up];
						col[1] += source.data[up+1];
						col[2] += source.data[up+2];
						count ++;
					}
					if(y != frame.height-1){
						col[0] += source.data[down];
						col[1] += source.data[down+1];
						col[2] += source.data[down+2];
						count ++;
					}

					output.data[i  ] = col[0]/count;
					output.data[i+1] = col[1]/count;
					output.data[i+2] = col[2]/count;
					output.data[i+3] = 255;
				}
			}

			source = output;
		}

		return output;
	}
}
