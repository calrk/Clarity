//Gradient Threshold object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface GradientThresholdOptions extends FilterOptions {
	threshold?: number;
	distance?: number;
}

export class GradientThreshold extends Filter {
	static override shader = /* glsl */ `
uniform float u_threshold;
uniform float u_distance;

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);
	int d = int(u_distance);

	if(p.x < d || p.y < d || p.x > size.x - 1 - d || p.y > size.y - 1 - d){
		fragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	//compares the red channel against four neighbours, like the CPU does
	float here = srcTexel(p).r;
	float left  = srcTexel(p + ivec2(-d, 0)).r;
	float right = srcTexel(p + ivec2( d, 0)).r;
	float up    = srcTexel(p + ivec2(0, -d)).r;
	float down  = srcTexel(p + ivec2(0,  d)).r;

	bool found =
		abs(here - left)  > u_threshold ||
		abs(here - right) > u_threshold ||
		abs(here - up)    > u_threshold ||
		abs(here - down)  > u_threshold;

	writeRGB(found ? vec3(255.0) : vec3(0.0));
}
`;

	static override schema: FilterSchema = {
		threshold: { type: 'float', label: 'Threshold', min: 0, max: 100, step: 1, default: 20, description: 'How much neighbouring pixels must differ to be marked.' },
		distance: { type: 'int', label: 'Distance', min: 1, max: 10, step: 1, default: 1, description: 'How far away the compared neighbour is, in pixels.' }
	};

	override properties: {
		threshold: number;
		distance: number;
	};

	constructor(options: GradientThresholdOptions = {}) {
		super(options);
		this.properties = {
			threshold: options.threshold || 20,
			distance: options.distance || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//the loops skip a `distance`-wide border, which would otherwise stay transparent
		for(let a = 3; a < output.data.length; a += 4){
			output.data[a] = 255;
		}

		let found = false;
		for(let y = this.properties.distance; y < frame.height - this.properties.distance; y++){
			for(let x = this.properties.distance; x < frame.width - this.properties.distance; x++){
				found = false;
				let i = (y*frame.width + x)*4;
				let up = ((y-this.properties.distance)*frame.width + x)*4;
				let down = ((y+this.properties.distance)*frame.width + x)*4;
				let left = (y*frame.width + (x-this.properties.distance))*4;
				let right = (y*frame.width + (x+this.properties.distance))*4;

				if(frame.data[i] < frame.data[left] - this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] > frame.data[left] + this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] < frame.data[right] - this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] > frame.data[right] + this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] < frame.data[up] - this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] > frame.data[up] + this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] < frame.data[down] - this.properties.threshold){
					found = true;
				}
				else if(frame.data[i] > frame.data[down] + this.properties.threshold){
					found = true;
				}
				if(found){
					output.data[i+0] = 255;
					output.data[i+1] = 255;
					output.data[i+2] = 255;
					output.data[i+3] = 255;
				}
				else{
					output.data[i+0] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
					output.data[i+3] = 255;	
				}

			}
		}
		return output;
	}
}
