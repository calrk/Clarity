//TODO: Make work properly
//Difference detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { RetainedFrames } from '../../gpu/GLBackend.js';

export interface DifferenceDetectorOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class DifferenceDetector extends Filter {
	//Compares against the first frame it ever saw.
	static override stateful = true;

	//One retained frame, captured once and held - the reference it opened on,
	//not the previous frame.
	static override retains(): RetainedFrames {
		return { length: 1, mode: 'first' };
	}

	static override shader = /* glsl */ `
void main(){
	ivec2 p = outPixel();

	//the opening frame is handed straight back - there is nothing yet to compare
	//it against, and it is what becomes the reference
	if(uHistoryCount == 0){
		writePixel(srcTexel(p));
		return;
	}

	//age 0 is the reference: 'first' mode captures once, so the ring never moves
	vec3 now = srcTexel(p).rgb;
	vec3 reference = historyTexel(0, p).rgb;

	bool same = all(lessThan(abs(now - reference), vec3(75.0)));
	writeRGB(same ? vec3(0.0) : now);
}
`;

	/** The reference frame, captured on the first call. */
	original: ImageData | null = null;

	constructor(options: DifferenceDetectorOptions = {}) {
		super(options);
		this.original = null;
	}

	override doProcess(frame: ImageData): ImageData {
		if(!this.original){
			//keeps its own copy, otherwise later filters mutating the frame
			//would drift the reference image out from under us
			this.original = createImageData(frame.width, frame.height);
			this.original.data.set(frame.data);
			return frame;
		}

		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let colour1 = [this.original.data[i], this.original.data[i+1], this.original.data[i+2]];
			let colour2 = [frame.data[i], frame.data[i+1], frame.data[i+2]];
			if(this.findDifference(colour2, colour1)){
				output.data[i]   = frame.data[i];
				output.data[i+1] = frame.data[i+1];
				output.data[i+2] = frame.data[i+2];
			}
			else{
				output.data[i]   = 0;
				output.data[i+1] = 0;
				output.data[i+2] = 0;
			}
			output.data[i+3] = 255;
		}

		return output;
	}

	protected override dropState(): void {
		this.original = null;
	}

	/** @deprecated Use {@link reset}, which every stateful filter now has. */
	resetOriginal(): void {
		this.reset();
	}

	findDifference(pix1: number[], pix2: number[]): boolean {
		if(pix1[0] < pix2[0] + 75 && pix1[0] > pix2[0] - 75){
			if(pix1[1] < pix2[1] + 75 && pix1[1] > pix2[1] - 75){
				if(pix1[2] < pix2[2] + 75 && pix1[2] > pix2[2] - 75){
					return false;
				}
			}
		}
		return true;
	}
}
