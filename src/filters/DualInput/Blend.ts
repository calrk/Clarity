//Blend object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface BlendOptions extends FilterOptions {
	ratio?: number;
}

/**
 * A weighted mix of two images: `first * ratio + second * (1 - ratio)`.
 *
 * The first frame's alpha carries through untouched rather than being mixed
 * with the second's - see `Filter.dual`. Mixing the two would read as the
 * obvious thing to do and is the one answer that makes the filter unusable on a
 * sprite: blend a subject halfway towards an opaque texture and the *ratio*
 * would be right while the subject went half-transparent everywhere it used to
 * be solid, and the frame around it went half-solid everywhere it used to be
 * empty. What the control means is how much of the second image's colour to
 * take, not how much of the first image to erase.
 */
export class Blend extends Filter {
	static override dual = true;

	static override shader = /* glsl */ `
uniform float u_ratio;

void main(){
	vec4 a = srcPixel(vUv);
	//writePixel rather than writeRGB, which hardcodes an opaque alpha
	writePixel(vec4(a.rgb * u_ratio + src2Pixel(vUv).rgb * (1.0 - u_ratio), a.a));
}
`;

	static override schema: FilterSchema = {
		//Stated the wrong way round until now, in the one place where getting it
		//wrong is most expensive: this string is the tooltip, the generated docs
		//and the site's filter reference. Both implementations have always
		//computed `first * ratio + second * (1 - ratio)`.
		ratio: { type: 'float', label: 'Ratio', min: 0, max: 1, step: 0.01, default: 0.5, description: '1 is all of the first image, 0 is all of the second.' }
	};

	override properties: {
		ratio: number;
	};

	constructor(options: BlendOptions = {}) {
		super(options);
		//`clamp(...) || 0.5` turned a deliberate ratio of 0 back into 0.5
		this.properties = {
			ratio: Operations.clamp(options.ratio === undefined ? 0.5 : options.ratio, 0, 1)
		};
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			output.data[i+0] = frame1.data[i  ]*this.properties.ratio + frame2.data[i  ]*(1-this.properties.ratio);
			output.data[i+1] = frame1.data[i+1]*this.properties.ratio + frame2.data[i+1]*(1-this.properties.ratio);
			output.data[i+2] = frame1.data[i+2]*this.properties.ratio + frame2.data[i+2]*(1-this.properties.ratio);
			//the first frame's alpha, not 255 - see Filter.dual
			output.data[i+3] = frame1.data[i+3];
		}

		return output;
	}
}
