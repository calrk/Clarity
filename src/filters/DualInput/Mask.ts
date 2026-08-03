//Mask object

import { Filter } from '../../core/Filter.js';
import { CHANNEL_FIELD } from '../../core/schema.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface MaskOptions extends FilterOptions {
	/** Mask value at or above which the first image shows through. */
	threshold?: number;
	/** Swaps which side of the threshold keeps the image. */
	inverted?: boolean;
}

/**
 * Binary stencil: keeps the first image wherever the mask is light, and blacks
 * it out wherever the mask is dark.
 *
 * This is deliberately *not* {@link Multiply}. Multiply is continuous - a 50%
 * grey mask halves the image. Mask has a hard cut-off, so a pixel is either
 * fully kept or fully dropped, with nothing in between. Feed it the output of
 * a thresholder or an edge detector and it behaves like a cookie cutter.
 */
export class Mask extends Filter {
	static override shader = /* glsl */ `
uniform float u_threshold;
uniform float u_inverted;

void main(){
	float value = channelValue(src2Pixel(vUv));
	bool keep = (value >= u_threshold) != (u_inverted > 0.5);
	writeRGB(keep ? srcPixel(vUv).rgb : vec3(0.0));
}
`;

	static override schema: FilterSchema = {
		threshold: { type: 'int', label: 'Threshold', min: 0, max: 255, step: 1, default: 128, description: 'Mask values at or above this keep the first image.' },
		inverted: { type: 'bool', label: 'Inverted', default: false, description: 'Keep the dark parts of the mask instead of the light ones.' },
		channel: CHANNEL_FIELD
	};

	override properties: {
		threshold: number;
		inverted: boolean;
	};

	constructor(options: MaskOptions = {}) {
		super(options);
		this.properties = {
			threshold: options.threshold ?? 128,
			inverted: options.inverted || false
		};
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		//This used to keep the image where the mask was *dark*, which is the
		//opposite of what the docs describe and the opposite of what everyone
		//means by a mask. White now means keep.
		//
		//It also only ever looked at the mask's red channel, so a coloured mask
		//gave a result that ignored two thirds of it. Going through
		//getColourValue means the `channel` option works here like it does
		//everywhere else, and the default 'grey' handles colour sensibly.
		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			const value = this.getColourValue(frame2, i, this.channel);
			const keep = (value >= this.properties.threshold) !== this.properties.inverted;

			if(keep){
				output.data[i+0] = frame1.data[i  ];
				output.data[i+1] = frame1.data[i+1];
				output.data[i+2] = frame1.data[i+2];
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
}
