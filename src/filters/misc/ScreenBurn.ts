//Screen Burn object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { RetainedFrames } from '../../gpu/GLBackend.js';

export interface ScreenBurnOptions extends FilterOptions {
	decay?: number;
}

/**
 * Burns a fading ghost of the brightest thing that has been on screen.
 *
 * The distinction from `Ghoster` is the operator, and it is the whole
 * difference in look: `Ghoster` *averages* the last N frames, so everything
 * leaves an equal, translucent trail. This takes the *maximum*, so only bright
 * things leave a mark and dark things leave none - which is how phosphor
 * actually fails. Move a white shape across a dark frame and Ghoster gives you
 * a smear while this gives you a scar.
 *
 * It accumulates rather than remembering. Each frame it reads back what it
 * produced last time, dims it by `decay`, and keeps whichever is brighter -
 * that or the pixel in front of it. So the whole trail is one frame of state
 * and one texture fetch, however long it lasts.
 *
 * That replaced a ring of up to 32 frames blended by age, and it is better for
 * two reasons rather than one. It is O(1) instead of O(length): the old shader
 * did 32 fetches per pixel at its longest, which made the best-looking setting
 * also the most expensive one. And a ring has an edge to fall off - a frame's
 * weight at the far end was not zero, so its contribution did not fade away, it
 * *stopped*, and the tail blinked out one frame at a time. A geometric decay
 * has no edge, so there is nothing to taper and nothing to pop.
 *
 * **Everything is floored to whole 0-255 steps on purpose.** The trail is fed
 * back through an 8-bit frame, and GL writes a float colour by rounding to
 * nearest - so `round(v * 0.98) == v` for every `v` up to 25, and every dim
 * pixel in the frame would freeze at its value and stay there for good. A floor
 * always loses at least one step, so the burn always reaches black. It also
 * makes the two backends agree exactly, which matters more here than elsewhere:
 * in a feedback loop a one-step disagreement is not confined to its frame, it
 * is fed back in and compounds.
 */
export class ScreenBurn extends Filter {
	//has to see every frame, in order, exactly once
	static override stateful = true;

	static override retains(): RetainedFrames {
		//one frame, and it is what this stage last produced rather than what it
		//was last given - see RetainedFrames.mode
		return { length: 1, mode: 'output' };
	}

	static override shader = /* glsl */ `
uniform float u_decay;

void main(){
	ivec2 p = outPixel();
	vec4 here = srcTexel(p);

	//uHistoryCount is the count before this frame, and an 'output' history is
	//written after the draw - so zero means nothing has been produced yet
	vec3 previous = uHistoryCount > 0 ? historyTexel(0, p).rgb : vec3(0.0);

	//floor, not round - see the note on the class
	writePixel(vec4(max(here.rgb, floor(previous * u_decay)), here.a));
}
`;

	static override schema: FilterSchema = {
		decay: {
			type: 'float',
			label: 'Decay',
			min: 0.5,
			max: 0.995,
			step: 0.005,
			default: 0.97,
			description: 'How much of the burn survives each frame. Higher lasts longer - 0.5 is gone in a moment, 0.99 takes several seconds.'
		}
	};

	override properties: {
		decay: number;
	};

	/**
	 * The trail so far, which is simply the last frame this returned.
	 *
	 * Held rather than copied: nothing downstream writes to a frame it has been
	 * handed, and the GPU side keeps a snapshot of the same thing.
	 */
	burn: ImageData | null = null;

	constructor(options: ScreenBurnOptions = {}) {
		super(options);
		this.properties = {
			decay: options.decay === undefined ? 0.97 : options.decay
		};
	}

	protected override dropState(): void {
		this.burn = null;
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const decay = this.properties.decay;

		//a resized frame is a different picture; the old trail does not fit it
		const previous =
			this.burn && this.burn.width === frame.width && this.burn.height === frame.height
				? this.burn.data
				: null;

		for(let i = 0; i < frame.data.length; i += 4){
			if(previous){
				const r = Math.floor(previous[i  ] * decay);
				const g = Math.floor(previous[i+1] * decay);
				const b = Math.floor(previous[i+2] * decay);

				output.data[i  ] = frame.data[i  ] > r ? frame.data[i  ] : r;
				output.data[i+1] = frame.data[i+1] > g ? frame.data[i+1] : g;
				output.data[i+2] = frame.data[i+2] > b ? frame.data[i+2] : b;
			}
			else {
				output.data[i  ] = frame.data[i  ];
				output.data[i+1] = frame.data[i+1];
				output.data[i+2] = frame.data[i+2];
			}
			output.data[i+3] = frame.data[i+3];
		}

		this.burn = output;
		return output;
	}
}
