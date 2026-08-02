//Blur object
//Currently uses StackBlur, maybe add more in future.

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { StackBlurProcess } from '../../vendor/StackBlur.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { StackBlurProcessInstance } from '../../vendor/StackBlur.js';

export interface BlurOptions extends FilterOptions {
	radius?: number;
}

/**
 * Shared by the two passes; only the step direction differs. Exported because
 * `Bleed` blurs with the same kernel and should not grow a second copy of it.
 */
export const BLUR_PASS = (axis: string) => /* glsl */ `
uniform float u_radius;

void main(){
	int radius = int(u_radius);
	ivec2 p = outPixel();
	ivec2 step_ = ivec2(${axis});

	//StackBlur is a triangular-weighted average, and a triangular kernel is
	//separable - so two passes of weight (r+1-|i|) reproduce it, rather than
	//porting the running-sum trick, which exists to make the CPU version fast
	//and has nothing to offer a GPU that samples in parallel anyway.
	vec3 sum = vec3(0.0);
	float total = 0.0;
	for(int i = -radius; i <= radius; i++){
		float weight = float(radius + 1 - abs(i));
		sum += srcTexel(p + step_ * i).rgb * weight;
		total += weight;
	}

	//stackBlurCanvasRGB leaves alpha exactly as it found it - the frame is copied
	//first and only the colour channels are touched - so alpha is carried
	//through rather than forced opaque.
	writePixel(vec4(sum / total, srcTexel(p).a));
}
`;

export class Blur extends Filter {
	static override shader = [
		{ source: BLUR_PASS('1, 0') },
		{ source: BLUR_PASS('0, 1') }
	];

	static override schema: FilterSchema = {
		radius: { type: 'int', label: 'Radius', min: 1, max: 180, step: 1, default: 10 }
	};

	override properties: {
		radius: number;
	};
	processor!: StackBlurProcessInstance;

	constructor(options: BlurOptions = {}) {
		super(options);
		this.processor = new (StackBlurProcess as unknown as new () => StackBlurProcessInstance)();

		this.properties = {
			radius: options.radius || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		if(this.properties.radius < 1){
			return frame;
		}

		let output = createImageData(frame.width, frame.height);
		    output.data.set(frame.data);

		return this.processor.stackBlurCanvasRGB(output, this.properties.radius);
	}
}
