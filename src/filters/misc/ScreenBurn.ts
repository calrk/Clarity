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
 *
 * That was not quite enough on its own. A geometric weight is still non-zero at
 * the oldest retained frame - at the old defaults it was 0.37 - so a frame's
 * contribution did not fade away, it *stopped*, and the tail of the trail
 * visibly popped out of existence one frame at a time. The weight is therefore
 * tapered to reach zero at `count + 1`, one step past the ring, so a frame has
 * already faded to nothing by the moment it is dropped. `decay` still shapes
 * the falloff; the taper only guarantees where it ends.
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
		//Tapered to zero at the far end of the ring, so a frame's contribution
		//has already reached nothing by the step it is dropped. Against
		//uHistoryLength rather than 'count', so a frame's weight depends only on
		//its age: while the ring is still filling nothing is being dropped, so
		//there is nothing to pop, and once it is full the two agree anyway.
		float fade = weight * (1.0 - float(j + 1) / float(uHistoryLength));
		burn = max(burn, historyTexel(j, p).rgb * fade);
	}

	writePixel(vec4(burn, srcTexel(p).a));
}
`;

	static override schema: FilterSchema = {
		//12 frames was too short to read as a burn at all - the effect the filter
		//exists for was invisible at its own defaults
		length: { type: 'int', label: 'Length', min: 1, max: 32, step: 1, default: 24, description: 'How many frames the burn remembers.' },
		decay: { type: 'float', label: 'Decay', min: 0.5, max: 1, step: 0.01, default: 0.98, description: 'How much dimmer the ghost gets each frame. At 1 it fades only with age, so the trail stays bright until it drops out.' }
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
			length: options.length || 24,
			decay: options.decay === undefined ? 0.98 : options.decay
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
		const count = this.frames.length;
		const span = Math.max(1, this.properties.length);

		//hoisted: the weight for a given age is the same for every pixel, and the
		//taper costs a divide that has no business being in the inner loop
		const weights = [];
		let weight = 1;
		for(let j = 0; j < count; j++){
			weight *= decay;
			weights[j] = weight * (1 - (j + 1) / span);
		}

		for(let i = 0; i < frame.data.length; i += 4){
			let r = frame.data[i];
			let g = frame.data[i+1];
			let b = frame.data[i+2];

			for(let j = 0; j < count; j++){
				const fade = weights[j];
				const older = this.frames[j].data;
				if(older[i]*fade   > r) r = older[i]*fade;
				if(older[i+1]*fade > g) g = older[i+1]*fade;
				if(older[i+2]*fade > b) b = older[i+2]*fade;
			}

			output.data[i  ] = r;
			output.data[i+1] = g;
			output.data[i+2] = b;
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}
}
