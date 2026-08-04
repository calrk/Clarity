//Shot Detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { sampleFrame } from '../../helpers/sample.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { FilterData } from '../../gpu/GLBackend.js';

export interface ShotDetectorOptions extends FilterOptions {
	threshold?: number;
}

/**
 * Marks the frame where a cut happened.
 *
 * The decision is about the *whole* frame, not about any pixel in it, which is
 * what separates this from `MotionDetector` and `DifferenceDetector`: those two
 * answer "what moved here", and a shot change is "how much of everything moved
 * at once". Something crossing the lens moves a lot of pixels a little; a cut
 * moves nearly all of them a lot.
 *
 * A whole-frame statistic is the shape `samples` and `prepare` exist for. It
 * takes a thumbnail rather than the frame - about 1% of the pixels, which is
 * ample for a mean - compares it against the previous thumbnail, and hands the
 * answer to the shader through `data`, since a uniform cannot be derived per
 * instance. Both backends run the same `prepare` on the same sampled pixels, so
 * they agree about what counts as a cut rather than agreeing approximately.
 */
export class ShotDetector extends Filter {
	//the comparison is against the previous frame, so every frame must be seen
	static override stateful = true;

	static override samples = 48;

	static override prepare(filter: any, sample: ImageData): void {
		const previous: ImageData | null = filter.previous ?? null;

		if(previous && previous.data.length === sample.data.length){
			let total = 0;
			for(let i = 0; i < sample.data.length; i += 4){
				total += Math.abs(sample.data[i]     - previous.data[i]);
				total += Math.abs(sample.data[i + 1] - previous.data[i + 1]);
				total += Math.abs(sample.data[i + 2] - previous.data[i + 2]);
			}
			filter.difference = total / (sample.data.length / 4 * 3);
		} else {
			//nothing to compare the first frame against, so it is never a cut
			filter.difference = 0;
		}

		const kept = createImageData(sample.width, sample.height);
		kept.data.set(sample.data);
		filter.previous = kept;
	}

	/** One texel carrying the frame's answer, because a uniform cannot. */
	static override data(filter: any): FilterData {
		const cut = filter.difference >= filter.properties.threshold ? 255 : 0;
		return { width: 1, height: 1, bytes: new Uint8Array([cut, 0, 0, 255]) };
	}

	static override shader = /* glsl */ `
void main(){
	vec4 c = srcPixel(vUv);

	//dataTexel is 0-255; the whole frame gets the same answer
	float cut = dataTexel(0, 0).r > 128.0 ? 1.0 : 0.0;

	//a red wash rather than a replacement, so the frame that was cut to is
	//still legible underneath the mark
	vec3 marked = mix(c.rgb, vec3(255.0, 0.0, 0.0), 0.45);
	writePixel(vec4(mix(c.rgb, marked, cut), c.a));
}
`;

	static override schema: FilterSchema = {
		threshold: {
			type: 'float',
			label: 'Threshold',
			min: 1,
			max: 128,
			step: 1,
			default: 24,
			description: 'Mean channel change across the frame that counts as a cut. Lower catches dissolves and camera shake too.'
		}
	};

	override properties: {
		threshold: number;
	};
	/** The previous thumbnail, kept between frames by `prepare`. */
	previous: ImageData | null = null;
	/** Mean absolute channel change against it, 0-255. */
	difference = 0;

	constructor(options: ShotDetectorOptions = {}) {
		super(options);
		this.properties = {
			threshold: options.threshold === undefined ? 24 : options.threshold
		};
	}

	protected override dropState(): void {
		this.previous = null;
		this.difference = 0;
	}

	override doProcess(frame: ImageData): ImageData {
		//`prepare` is the shared entry point, so both backends decide from
		//identical pixels rather than from the frame and a sample of it
		ShotDetector.prepare(this, sampleFrame(frame, ShotDetector.samples));

		const output = createImageData(frame.width, frame.height);
		const cut = this.difference >= this.properties.threshold;

		for(let i = 0; i < frame.data.length; i += 4){
			if(cut){
				output.data[i  ] = frame.data[i  ] + (255 - frame.data[i  ])*0.45;
				output.data[i+1] = frame.data[i+1] * 0.55;
				output.data[i+2] = frame.data[i+2] * 0.55;
			} else {
				output.data[i  ] = frame.data[i  ];
				output.data[i+1] = frame.data[i+1];
				output.data[i+2] = frame.data[i+2];
			}
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}
}
