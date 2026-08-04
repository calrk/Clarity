//FishEye object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface FishEyeOptions extends FilterOptions {
	amount?: number;
	zoom?: number;
}

/**
 * Barrel and pincushion distortion - the curve of a lens, or of a CRT.
 *
 * Written as a gather: for each *output* pixel it works out which input pixel
 * belongs there, which is the only form that guarantees every output pixel is
 * written. A scatter would leave holes wherever the distortion stretches.
 *
 * Distance is normalised by half the diagonal, so the whole frame lies inside
 * a radius of 1 and the effect is circular in pixel space rather than stretched
 * with the aspect ratio. A positive `amount` samples further out as the radius
 * grows, which magnifies the centre relative to the edges and bows straight
 * lines outward - barrel, the fisheye direction. Negative pincushions instead.
 *
 * Anything sampled from outside the frame is left black rather than clamped,
 * because the point of the barrel case is that the frame has an edge and you
 * are meant to see it. `zoom` is there to push that edge back off-screen when
 * you want the curve without the border.
 */
export class FishEye extends Filter {
	static override shader = /* glsl */ `
uniform float u_amount;
uniform float u_zoom;

void main(){
	ivec2 p = outPixel();
	vec2 size = uSize;
	vec2 centre = size * 0.5;
	float half_ = length(centre);

	vec2 offset = (vec2(p) + 0.5 - centre) / half_;
	float r2 = dot(offset, offset);

	//sampling further out as the radius grows magnifies the middle, which is
	//what bows straight lines outward
	vec2 from = centre + offset * (1.0 + u_amount * r2) * half_ / u_zoom;
	ivec2 at = ivec2(floor(from));

	if(at.x < 0 || at.y < 0 || at.x > int(size.x) - 1 || at.y > int(size.y) - 1){
		fragColor = vec4(0.0, 0.0, 0.0, 1.0);
		return;
	}

	writePixel(srcTexel(at));
}
`;

	static override schema: FilterSchema = {
		amount: {
			type: 'float',
			label: 'Amount',
			min: -1,
			max: 1,
			step: 0.05,
			default: 0.3,
			description: 'Above zero bows the image outward like a lens or a CRT face; below zero pinches it inward.'
		},
		zoom: {
			type: 'float',
			label: 'Zoom',
			min: 0.5,
			max: 2,
			step: 0.05,
			default: 1,
			description: 'Scales the frame before distorting, to push the black corners back off-screen.'
		}
	};

	override properties: {
		amount: number;
		zoom: number;
	};

	constructor(options: FishEyeOptions = {}) {
		super(options);
		this.properties = {
			amount: options.amount === undefined ? 0.3 : options.amount,
			zoom: options.zoom || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;
		const { amount, zoom } = this.properties;

		const centreX = width * 0.5;
		const centreY = height * 0.5;
		const half = Math.sqrt(centreX*centreX + centreY*centreY);

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const ox = (x + 0.5 - centreX) / half;
				const oy = (y + 0.5 - centreY) / half;
				const scale = (1 + amount*(ox*ox + oy*oy)) * half / zoom;

				const fromX = Math.floor(centreX + ox*scale);
				const fromY = Math.floor(centreY + oy*scale);
				const to = (y*width + x)*4;

				if(fromX < 0 || fromY < 0 || fromX > width - 1 || fromY > height - 1){
					output.data[to+3] = 255;	//outside the frame: black, not clamped
					continue;
				}

				const from = (fromY*width + fromX)*4;
				output.data[to  ] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];
				output.data[to+3] = frame.data[from+3];
			}
		}

		return output;
	}
}
