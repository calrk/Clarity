//Skin Detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface SkinDetectorOptions extends FilterOptions {
	/** No filter-specific options. */
}

/**
 * Chroma is measured as an offset from neutral grey, and that offset shrinks
 * with the signal it is carried on. Two people with the same hue but different
 * amounts of melanin do not land in different parts of Cb/Cr - they land at
 * different distances along the same line out of the middle. So a fixed box
 * cannot mean the same thing at both ends, and the end it stops meaning
 * anything at is the dark one.
 *
 * The old bounds here were Chai & Ngan's, tightened from their published
 * Cb 77-127 to 80-121. Measured against the site's own face samples, that
 * tightening was doing the damage: a shadowed neck sat at Cb 121.4 against a
 * ceiling of 121 and was detected 52% of the time, while the same subject's lit
 * cheek cleared every bound and read 100%. It failed on the Cb ceiling, half a
 * unit out, with Cr still well inside its range.
 *
 * The fix is to scale the chroma offset back up to a reference luminance before
 * comparing it, so the box describes a hue rather than a hue at one brightness.
 * `GAIN` is capped because the scaling amplifies sensor noise along with the
 * signal, and `Y_FLOOR` drops pixels too dark to carry a usable chroma at all.
 */
const Y_REF = 160;
const GAIN = 3;
const Y_FLOOR = 28;
const CB_MIN = 77;
const CB_MAX = 127;
const CR_MIN = 129;
const CR_MAX = 177;

export class SkinDetector extends Filter {
	static override shader = /* glsl */ `
void main(){
	vec3 ycc = rgb2ycbcr(srcPixel(vUv).rgb);
	float gain = min(${Y_REF}.0 / max(ycc.x, 1.0), ${GAIN}.0);
	vec2 c = vec2(128.0) + (ycc.yz - vec2(128.0)) * gain;
	bool skin = ycc.x > ${Y_FLOOR}.0
		&& c.x > ${CB_MIN}.0 && c.x < ${CB_MAX}.0
		&& c.y > ${CR_MIN}.0 && c.y < ${CR_MAX}.0;
	writeRGB(skin ? vec3(255.0) : vec3(0.0));
}
`;

	constructor(options: SkinDetectorOptions = {}) {
		super(options);

	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			//Kept in float rather than round-tripped through the output bytes: the
			//gain below multiplies any rounding error along with everything else,
			//and the GPU path carries the float too.
			const Y  =  16 + ( 66*frame.data[i] + 129*frame.data[i+1] +  25*frame.data[i+2])/256;
			const Cb = 128 + (-38*frame.data[i] -  74*frame.data[i+1] + 112*frame.data[i+2])/256;
			const Cr = 128 + (112*frame.data[i] -  94*frame.data[i+1] -  18*frame.data[i+2])/256;

			const gain = Math.min(Y_REF / Math.max(Y, 1), GAIN);
			const cb = 128 + (Cb - 128)*gain;
			const cr = 128 + (Cr - 128)*gain;

			const skin = Y > Y_FLOOR &&
					CB_MIN < cb && cb < CB_MAX &&
					CR_MIN < cr && cr < CR_MAX;

			output.data[i+0] = skin ? 255 : 0;
			output.data[i+1] = skin ? 255 : 0;
			output.data[i+2] = skin ? 255 : 0;
			output.data[i+3] = 255;
		}

		return output;
	}
}
