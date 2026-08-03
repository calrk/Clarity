//Desaturate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface DesaturateOptions extends FilterOptions {
	/** How far towards grey, 0 to 1. Defaults to 1, fully grey. */
	amount?: number;
}

export class Desaturate extends Filter {
	static override shader = /* glsl */ `
uniform float u_amount;

void main(){
	vec4 c = srcPixel(vUv);
	writeRGB(mix(c.rgb, vec3(luma(c)), u_amount));
}
`;

	static override schema: FilterSchema = {
		amount: {
			type: 'float',
			label: 'Amount',
			min: 0,
			max: 1,
			step: 0.01,
			default: 1,
			description: 'How far towards grey. 1 removes colour entirely.'
		}
	};

	override properties: {
		amount: number;
	};

	constructor(options: DesaturateOptions = {}) {
		super(options);
		this.properties = {
			//`options.amount || 1` would turn a deliberate 0 back into 1
			amount: options.amount === undefined ? 1 : options.amount
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		let amount = this.properties.amount;

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let grey = this.getColourValue(frame, i, 'grey');

			//a partial desaturate is a mix towards grey rather than some other
			//grey, so amount 1 still lands exactly where it always did
			output.data[i+0] = frame.data[i+0] + (grey - frame.data[i+0])*amount;
			output.data[i+1] = frame.data[i+1] + (grey - frame.data[i+1])*amount;
			output.data[i+2] = frame.data[i+2] + (grey - frame.data[i+2])*amount;
			output.data[i+3] = 255;
		}

		return output;
	}
}
