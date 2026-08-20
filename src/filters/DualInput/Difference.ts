//Difference object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface DifferenceOptions extends FilterOptions {
	/** No filter-specific options. */
}

/**
 * The absolute difference between two images, channel by channel.
 *
 * The distinction from {@link Subtract} is the whole point of it existing.
 * Subtract writes `a - b` into a `Uint8ClampedArray`, so everywhere the second
 * image is brighter the result is 0 and half the range is thrown away - which
 * is the right answer for "take this away from that" and the wrong one for
 * "how far apart are these". Taking the magnitude keeps both directions, and
 * the operation becomes symmetric: `|a - b|` is the same picture either way
 * round, so the order the two frames arrive in stops mattering.
 *
 * Folding is what makes it interesting rather than merely correct. Where the
 * two images are close, the result is near black; where they cross, it creases
 * hard instead of passing smoothly through. Run it against a noise field and
 * you get Photoshop's Difference Clouds - and running it again over its own
 * output folds an already-folded field, which is where the marbled, veined
 * look comes from. `Cloud` reseeds on every call, so a chain of
 * `Cloud → Difference` repeated is the equivalent of holding Ctrl-F down.
 *
 * The *colour* is symmetric. The alpha is not: the output carries the first
 * frame's, like the rest of the family - see `Filter.dual`. Taking `|a - b|` of
 * the alphas as well would be symmetric, and would also mean that differencing
 * a frame against a copy of itself erased it, and that anything differenced
 * against an opaque frame came back a ghost. The symmetry worth having is the
 * one the filter exists for, and that one is about the picture.
 */
export class Difference extends Filter {
	static override dual = true;

	static override shader = /* glsl */ `
void main(){
	vec4 a = srcPixel(vUv);
	//writePixel rather than writeRGB, which hardcodes an opaque alpha
	writePixel(vec4(abs(a.rgb - src2Pixel(vUv).rgb), a.a));
}
`;

	constructor(options: DifferenceOptions = {}) {
		super(options);
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i  ] = Math.abs(frame1.data[i  ] - frame2.data[i  ]);
			output.data[i+1] = Math.abs(frame1.data[i+1] - frame2.data[i+1]);
			output.data[i+2] = Math.abs(frame1.data[i+2] - frame2.data[i+2]);
			//the first frame's alpha, not 255 - see Filter.dual
			output.data[i+3] = frame1.data[i+3];
		}

		return output;
	}
}
