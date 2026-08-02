//Value Threshold object

import { Filter } from '../../core/Filter.js';
import { CHANNEL_FIELD } from '../../core/schema.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface ValueThresholdOptions extends FilterOptions {
	inverted?: boolean;
	threshold?: number;
}

export class ValueThreshold extends Filter {
	static override shader = [
		{
			//Auto mode splits the frame at the midpoint of its own range, so the
			//minimum and maximum have to be known before any pixel can be decided.
			//The seed maps each pixel to the channel value being compared; the
			//pyramid in `runReduction` collapses it to a single texel.
			reduce: /* glsl */ `
void main(){
	float value = channelValue(srcPixel(vUv)) / 255.0;
	fragColor = vec4(value, value, 0.0, 1.0);
}
`,
			source: /* glsl */ `
uniform float u_threshold;
uniform float u_threshold_auto;
uniform float u_inverted;

void main(){
	float threshold = u_threshold;
	if(u_threshold_auto > 0.5){
		vec2 range = reduction();
		threshold = (range.x + range.y) / 2.0;
	}

	float value = channelValue(srcPixel(vUv));
	bool lit = u_inverted > 0.5 ? (value < threshold) : (value > threshold);
	writeRGB(lit ? vec3(255.0) : vec3(0.0));
}
`
		}
	];

	static override schema: FilterSchema = {
		inverted: { type: 'bool', label: 'Inverted', default: false },
		threshold: { type: 'int', label: 'Threshold', min: 0, max: 255, step: 1, default: null, nullable: true, nullLabel: 'Auto', description: 'Auto splits the frame at the midpoint of its own range.' },
		channel: CHANNEL_FIELD
	};

	override properties: {
		inverted: boolean;
		/** `null` means "work it out from the frame each time". */
		threshold: number | null;
	};

	constructor(options: ValueThresholdOptions = {}) {
		super(options);
		this.properties = {
			inverted: options.inverted || false,
			threshold: options.threshold || null		
		}
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//gets the threshold value
		let threshold = this.properties.threshold || this.getThresholdValue(frame);
		//performs the thresholding on the data
		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let colour = this.getColourValue(frame, i, this.channel);
			if(this.properties.inverted){
				if(colour < threshold){
					output.data[i+0] = 255;
					output.data[i+1] = 255;
					output.data[i+2] = 255;
				}
				else{
					output.data[i+0] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}
			}
			else{
				if(colour > threshold){
					output.data[i+0] = 255;
					output.data[i+1] = 255;
					output.data[i+2] = 255;
				}
				else{
					output.data[i+0] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}
			}
			output.data[i+3] = 255;
		}

		return output;
	}

	/**
	 * The midpoint of the frame's own range - the split that auto mode means.
	 *
	 * This used to be an iterative intermeans search, which is a real algorithm
	 * (ISODATA) but was built on `average = (average + colour) / 2` applied pixel
	 * by pixel. That recurrence weights the last pixel of the frame at 50% and
	 * the first at 2^-n, so it is not an average of anything and the loop was
	 * converging on a number with no meaning. Intermeans can come back as a
	 * second option later - it needs a sum reduction, which is the same pyramid
	 * with a different combine - but the midpoint is what "auto" was reaching
	 * for, it is O(n) rather than unbounded, and the GPU already computes the
	 * minimum and maximum it needs.
	 */
	getThresholdValue(frame: ImageData): number {
		let lowest = 255;
		let highest = 0;

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let colour = this.getColourValue(frame, i);
			if(colour < lowest){
				lowest = colour;
			}
			if(colour > highest){
				highest = colour;
			}
		}

		return (lowest + highest)/2;
	}
}
