//Mirror
//Mirrors the image in x or y

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface MirrorOptions extends FilterOptions {
	horizontal?: boolean;
	vertical?: boolean;
}

export class Mirror extends Filter {
	static override shader = /* glsl */ `
uniform float u_horizontal;
uniform float u_vertical;

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);
	if(u_horizontal > 0.5) p.x = size.x - 1 - p.x;
	if(u_vertical > 0.5)   p.y = size.y - 1 - p.y;
	writeRGB(srcTexel(p).rgb);
}
`;

	static override schema: FilterSchema = {
		horizontal: { type: 'bool', label: 'Horizontal', default: true, description: 'Flip left to right.' },
		vertical: { type: 'bool', label: 'Vertical', default: false, description: 'Flip top to bottom. With both set the image is rotated 180 degrees.' }
	};

	override properties: {
		horizontal: boolean;
		vertical: boolean;
	};

	constructor(options: MirrorOptions = {}) {
		super(options);
		this.properties = {
			//`options.horizontal || true` is always true - it could never be turned off
			horizontal: options.horizontal === undefined ? true : options.horizontal,
			vertical: options.vertical || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//written as a gather (read from the mirrored source) rather than a scatter, so
		//every output pixel is guaranteed to be written. The old scatter used
		//width-x / height-y, which wrote index `width` on x=0 - wrapping onto the next
		//row - and never wrote column 0 at all.
		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let to = (y*frame.width + x)*4;
				let fromX = x;
				let fromY = y;
				if(this.properties.horizontal){
					fromX = frame.width-1-x;
				}
				if(this.properties.vertical){
					fromY = frame.height-1-y;
				}

				let from = ((fromY)*frame.width + fromX)*4;

				output.data[to] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];

				output.data[to+3] = 255;
			}
		}

		return output;
	}
}
