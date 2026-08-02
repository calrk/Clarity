//Median Threshold object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { sampleFrame } from '../../helpers/sample.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterData } from '../../gpu/GLBackend.js';

export interface MedianThresholdOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class MedianThreshold extends Filter {
	static override shader = /* glsl */ `
void main(){
	vec3 c = srcPixel(vUv).rgb;
	vec3 out_ = vec3(255.0);

	for(int channel = 0; channel < 3; channel++){
		//uData holds the quartile boundaries, computed on the CPU from a small
		//sample. A histogram is possible in WebGL2 by rendering points with
		//additive blending, but it is the wrong shape for a fragment shader and
		//the sample costs about 1% of a frame readback - see Filter.samples.
		for(int i = 0; i < 8; i++){
			if(i >= int(uDataSize.x)){
				break;
			}
			float thresh = dataValue(i, 0);
			if(c[channel] < thresh){
				out_[channel] = thresh;
				break;
			}
		}
		//the CPU appends a final threshold of 256, which every remaining value
		//falls under and which clamps to 255 on the way out
	}

	writeRGB(out_);
}
`;

	/** Enough of the frame for a stable quartile split, at 1% of the transfer. */
	static override samples = 48;

	static override prepare(filter: any, sample: ImageData): void {
		filter.threshes = filter.getThresholdValues(sample);
	}

	static override data(filter: any): FilterData | null {
		const threshes: number[] = filter.threshes ?? [];
		if(threshes.length === 0){
			return null;
		}

		const bytes = new Uint8Array(threshes.length * 4);
		for(let i = 0; i < threshes.length; i++){
			bytes[i*4] = Math.min(threshes[i], 255);
			bytes[i*4 + 3] = 255;
		}

		return { width: threshes.length, height: 1, bytes };
	}

	threshes?: any;

	constructor(options: MedianThresholdOptions = {}) {
		super(options);
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//The quartiles come from a small point-sampled copy rather than the whole
		//frame, so that the shader can have them without a full readback and the
		//two backends split the image in the same place. `prepare` is the shared
		//entry point. See src/helpers/sample.ts.
		MedianThreshold.prepare(this, sampleFrame(frame, MedianThreshold.samples));
		//the shader has this last one built in, since 256 does not fit in a byte
		this.threshes.push(256);
		//performs the thresholding on the data
		for(let i = 0; i < frame.data.length; i++){
			if(!((i+1)%4 == 0)){
				for(let j = 0; j < this.threshes.length; j++){
					if(frame.data[i] < this.threshes[j]){
						output.data[i] = this.threshes[j];
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

	getThresholdValues(data: any) {
		let values = new Array();
		let median = [0,0,0];

		for(let i = 0; i < 256; i++){
			values[i] = 0;
		}

		for(let i = 0; i < data.data.length; i+=4){
			// if(data.data[i] != 0)
				values[data.data[i]] ++;
		}

		let cumulative = 0;
		let maximum = data.data.length/4/4;
		let pos = 0;
		for(let i = 0; i < 256; i++){
			cumulative += values[i];
			if(cumulative > maximum){
				maximum += data.data.length/4/4;
				median[pos] = i;
				pos++;
			}
		}

		return median;
	}
}
