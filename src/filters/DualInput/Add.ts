//Add object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface AddOptions extends FilterOptions {
	/** No filter-specific options. */
}

/**
 * Adds the second image to the first. Channels that overflow are clamped to
 * 255 by the underlying Uint8ClampedArray, so bright areas blow out to white.
 *
 * The first frame's alpha carries through untouched - see `Filter.dual`, which
 * carries the rule for the whole family.
 */
export class Add extends Filter {
	static override dual = true;

	static override shader = /* glsl */ `
void main(){
	vec4 a = srcPixel(vUv);
	//writePixel rather than writeRGB, which hardcodes an opaque alpha
	writePixel(vec4(a.rgb + src2Pixel(vUv).rgb, a.a));
}
`;

	constructor(options: AddOptions = {}) {
		super(options);

	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i  ] = frame1.data[i  ] + frame2.data[i  ];
			output.data[i+1] = frame1.data[i+1] + frame2.data[i+1];
			output.data[i+2] = frame1.data[i+2] + frame2.data[i+2];
			//the first frame's alpha, not 255 - see Filter.dual
			output.data[i+3] = frame1.data[i+3];
		}

		return output;
	}
}
