//Screen Burn object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { RetainedFrames } from '../../gpu/GLBackend.js';

export interface ScreenBurnOptions extends FilterOptions {
	length?: number;
	decay?: number;
}

/**
 * Burns a fading ghost of the brightest thing that has been on screen.
 *
 * The distinction from `Ghoster` is the operator, and it is the whole
 * difference in look: `Ghoster` *averages* the last N frames, so everything
 * leaves an equal, translucent trail. This takes the *maximum*, weighted by
 * age, so only bright things leave a mark and dark things leave none - which is
 * how phosphor actually fails. Move a white shape across a dark frame and
 * Ghoster gives you a smear while this gives you a scar.
 *
 * `decay` is the per-frame weight on that maximum, so the ghost fades
 * geometrically rather than falling off a cliff when it leaves the ring.
 */
export class ScreenBurn extends Filter {
	//has to see every frame, in order, exactly once
	static override stateful = true;

	static override retains(filter: any): RetainedFrames {
		return { length: Math.max(1, Number(filter.properties.length)) };
	}

	static override shader = /* glsl */ `
uniform float u_length;
uniform float u_decay;

void main(){
	ivec2 p = outPixel();
	vec3 here = srcTexel(p).rgb;

	//the ring is only as deep as the frames actually seen so far
	int count = min(uHistoryCount + 1, uHistoryLength);
	vec3 burn = here;
	float weight = 1.0;

	for(int j = 0; j < 32; j++){
		if(j >= count){
			break;
		}
		weight *= u_decay;
		burn = max(burn, historyTexel(j, p).rgb * weight);
	}

	writePixel(vec4(burn, srcTexel(p).a));
}
`;

	static override schema: FilterSchema = {
		length: { type: 'int', label: 'Length', min: 1, max: 32, step: 1, default: 12, description: 'How many frames the burn remembers.' },
		decay: { type: 'float', label: 'Decay', min: 0.5, max: 1, step: 0.01, default: 0.92, description: 'How much dimmer the ghost gets each frame. 1 never fades.' }
	};

	override properties: {
		length: number;
		decay: number;
	};
	/** Newest first, like Ghoster's. */
	frames: ImageData[] = [];

	constructor(options: ScreenBurnOptions = {}) {
		super(options);
		this.properties = {
			length: options.length || 12,
			decay: options.decay === undefined ? 0.92 : options.decay
		};
	}

	protected override dropState(): void {
		this.frames = [];
	}

	override propertyChanged(key: string): void {
		if(key === 'length'){
			this.reset();
		}
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const kept = createImageData(frame.width, frame.height);
		kept.data.set(frame.data);

		this.frames.unshift(kept);
		while(this.frames.length > this.properties.length){
			this.frames.pop();
		}

		const decay = this.properties.decay;

		for(let i = 0; i < frame.data.length; i += 4){
			let r = frame.data[i];
			let g = frame.data[i+1];
			let b = frame.data[i+2];
			let weight = 1;

			for(let j = 0; j < this.frames.length; j++){
				weight *= decay;
				const older = this.frames[j].data;
				if(older[i]*weight   > r) r = older[i]*weight;
				if(older[i+1]*weight > g) g = older[i+1]*weight;
				if(older[i+2]*weight > b) b = older[i+2]*weight;
			}

			output.data[i  ] = r;
			output.data[i+1] = g;
			output.data[i+2] = b;
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}
}
