//Multiply object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface MultiplyOptions extends FilterOptions {
	/** No filter-specific options. */
}

export class Multiply extends Filter {
	static override dual = true;

	static override shader = /* glsl */ `
void main(){
	vec4 a = srcPixel(vUv);
	vec3 b = src2Pixel(vUv).rgb;
	//writePixel rather than writeRGB, which hardcodes 1.0 - see doProcess
	writePixel(vec4(a.rgb * b / 255.0, a.a));
}
`;

	constructor(options: MultiplyOptions = {}) {
		super(options);
		/*this.properties = {
			ratio: Operations.clamp(options.ratio, 0, 1) || 0.5
		};*/
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i+0] = ((frame1.data[i  ]/255) * (frame2.data[i  ])/255)*255;
			output.data[i+1] = ((frame1.data[i+1]/255) * (frame2.data[i+1])/255)*255;
			output.data[i+2] = ((frame1.data[i+2]/255) * (frame2.data[i+2])/255)*255;
			//The first frame's alpha, not 255.
			//
			//This assigned 255 until now, which made the filter unusable for the
			//thing it is most obviously for: shading something that has a shape.
			//Multiplying a cloud through a sprite to give it texture returned a
			//rectangle, because the silhouette lives in the alpha channel and the
			//alpha channel was being thrown away. There was no workaround inside
			//the library - a caller had to composite by hand.
			//
			//The first frame is the subject and the second is the shading, which is
			//already the asymmetry the filter has: `frame2` is the one resampled to
			//fit. So the subject's shape survives and the modifier only ever
			//changes colour. Two frames of the same size in either order still give
			//the same colours, so nothing that was multiplying opaque frames sees
			//any difference at all.
			//
			//This is the convention the per-pixel filters already keep - `Blur`,
			//`Levels`, `GradientMap`, `Vignette` and `hsvShifter` all pass alpha
			//through, and `Blur` has a note in FEATURES.md about the shader once
			//forcing it to 255 and being wrong. This filter was where the
			//dual-input family broke it, and finding that here is what got the
			//rest of the family fixed with it - `Filter.dual` now states the rule
			//for all of them, and the others carry a pointer rather than a copy of
			//this reasoning.
			//
			//It needs no `alpha-out` trait, because it does not *create*
			//transparency: opaque in, opaque out, which is what the filters test
			//asserts for everything without that trait.
			output.data[i+3] = frame1.data[i+3];
		}

		return output;
	}
}
