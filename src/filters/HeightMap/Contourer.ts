//Contourer object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface ContourerOptions extends FilterOptions {
	contours?: number;
}

export class Contourer extends Filter {
	static override shader = [
		{
			//Contours are relative to the frame's own range, so the bands cannot be
			//computed until the minimum and maximum are known. The CPU takes those
			//from the red channel, so the seed does too.
			reduce: /* glsl */ `
void main(){
	float value = srcPixel(vUv).r / 255.0;
	fragColor = vec4(value, value, 0.0, 1.0);
}
`,
			source: /* glsl */ `
uniform float u_contours;

void main(){
	vec2 range = reduction();
	float lowest = range.x;
	float highest = range.y;

	//a flat frame has no range to band, and dividing by it would spin forever -
	//the CPU returns an untouched (transparent) buffer, so this matches
	if(highest == lowest){
		fragColor = vec4(0.0);
		return;
	}

	float difference = (highest - lowest) / u_contours;
	vec3 c = srcPixel(vUv).rgb;
	vec3 banded = vec3(255.0);

	for(int channel = 0; channel < 3; channel++){
		float value = c[channel];

		//Thresholds are *accumulated* rather than computed as lowest + n*step,
		//because the CPU accumulates and the two do not land in the same place.
		//The top threshold ends up a hair above the frame's maximum there, so
		//the single pixel sitting exactly on the maximum falls inside the last
		//band instead of past it - a difference of 43 on one pixel, which is
		//invisible until a parity test goes looking.
		float thresh = lowest + difference;
		float band = 0.0;

		for(int n = 0; n < 320; n++){
			if(value < thresh){
				banded[channel] = thresh > 256.0 ? 255.0 : band / (highest - lowest) * 255.0;
				break;
			}
			if(thresh > 256.0){
				banded[channel] = 255.0;
				break;
			}
			thresh += difference;
			band += difference;
		}
	}

	writeRGB(banded);
}
`
		}
	];

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
