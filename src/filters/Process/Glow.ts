//Glow object

import { Filter } from '../../core/Filter.js';
import { Blur, BLUR_PASS } from './Blur.js';
import { Blend } from '../DualInput/Blend.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface GlowOptions extends FilterOptions {
	radius?: number;
}

//Blurs the image and blends that back over the original. Delegates to Blur
//rather than touching a blur implementation directly, so swapping the blur
//out (FEATURES.md #3) only has to change one filter.
export class Glow extends Filter {
	static override shader = [
		{ source: BLUR_PASS('1, 0') },
		{ source: BLUR_PASS('0, 1') },
		{
			//uSrc is the blur by this point, so the frame to blend it back over has
			//to come from uOriginal - the executor stashes the stage's input aside
			//before the first pass precisely for this.
			source: /* glsl */ `
void main(){
	writeRGB(originalPixel(vUv).rgb * 0.5 + srcPixel(vUv).rgb * 0.5);
}
`
		}
	];

	static override schema: FilterSchema = {
		radius: { type: 'int', label: 'Radius', min: 1, max: 180, step: 1, default: 10 }
	};

	override properties: {
		radius: number;
	};

	constructor(options: GlowOptions = {}) {
		super(options);
		this.properties = {
			radius: options.radius || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let blur = new Blur({radius: this.properties.radius}).process(frame);
		let blend = new Blend({ratio: 0.5}).process([frame, blur]);

		return blend;
	}
}
