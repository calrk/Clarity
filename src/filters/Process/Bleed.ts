//Bleed object
//Colour bleed: chroma is smeared, luma is left sharp.

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import { StackBlurProcess } from '../../vendor/StackBlur.js';
import { BLUR_PASS } from './Blur.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { StackBlurProcessInstance } from '../../vendor/StackBlur.js';

export interface BleedOptions extends FilterOptions {
	radius?: number;
}

/**
 * Composite colour bleed.
 *
 * Analogue video carries chroma at a fraction of luma's bandwidth, so colour
 * smears sideways while detail stays sharp. That is what this reproduces, and
 * it is a different effect from `ChromaticAberration`, which displaces the
 * channels relative to each other rather than blurring them.
 *
 * It used to call `stackBlurCanvasSingle`, whose vendor source opens with a
 * hardcoded `channel = 0` that overwrites the argument - so it blurred *red*,
 * always, and the `channel` control in its schema did nothing at all.
 *
 * The implementation looks like it blurs the whole frame, which is not what the
 * description says. It is, though: YUV is a linear transform of RGB and blur is
 * a linear operator, so blurring RGB and then taking U and V from the result is
 * identical to blurring the chroma planes directly - and it means both paths
 * reuse `Blur`'s already parity-checked kernel instead of growing a second one.
 */
export class Bleed extends Filter {
	static override shader = [
		{ source: BLUR_PASS('1, 0') },
		{ source: BLUR_PASS('0, 1') },
		{
			source: /* glsl */ `
void main(){
	//uSrc is the blurred frame by now; uOriginal is what entered the filter
	vec3 sharp = originalPixel(vUv).rgb / 255.0;
	vec3 soft = srcPixel(vUv).rgb / 255.0;

	vec3 keep = rgb2yuv(sharp);
	vec3 smeared = rgb2yuv(soft);

	writePixel(vec4(
		yuv2rgb(vec3(keep.x, smeared.y, smeared.z)) * 255.0,
		originalPixel(vUv).a
	));
}
`
		}
	];

	static override schema: FilterSchema = {
		radius: { type: 'int', label: 'Radius', min: 1, max: 180, step: 1, default: 10, description: 'How far the colour smears. Detail is unaffected.' }
	};

	override properties: {
		radius: number;
	};
	processor!: StackBlurProcessInstance;

	constructor(options: BleedOptions = {}) {
		super(options);
		this.processor = new (StackBlurProcess as unknown as new () => StackBlurProcessInstance)();

		this.properties = {
			radius: options.radius || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		//StackBlur bails out with a bare `return` below a radius of 1, so the
		//result is `undefined` rather than an unblurred frame. Everything
		//downstream then dies on `.data`. Declaring a minimum of 1 in the schema
		//stops a control reaching it, but the constructor is not the only way in.
		if(this.properties.radius < 1){
			return frame;
		}

		let blurred = createImageData(frame.width, frame.height);
		blurred.data.set(frame.data);
		blurred = this.processor.stackBlurCanvasRGB(blurred, this.properties.radius);

		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.data.length; i+=4){
			let keep = Operations.RGBtoYUV({
				r: frame.data[i]/255,
				g: frame.data[i+1]/255,
				b: frame.data[i+2]/255
			});
			let smeared = Operations.RGBtoYUV({
				r: blurred.data[i]/255,
				g: blurred.data[i+1]/255,
				b: blurred.data[i+2]/255
			});

			//luma from the sharp frame, chroma from the blurred one
			let rgb = Operations.YUVtoRGB({ y: keep.y, u: smeared.u, v: smeared.v });

			output.data[i  ] = rgb.r*255;
			output.data[i+1] = rgb.g*255;
			output.data[i+2] = rgb.b*255;
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}
}
