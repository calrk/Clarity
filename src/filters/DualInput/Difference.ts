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
 */
export class Difference extends Filter {
	static override shader = /* glsl */ `
void main(){
	writeRGB(abs(srcPixel(vUv).rgb - src2Pixel(vUv).rgb));
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
			output.data[i+3] = 255;
		}

		return output;
	}
}
