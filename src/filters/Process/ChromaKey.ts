//ChromaKey object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface ChromaKeyOptions extends FilterOptions {
	/** Six hex digits, with or without the leading `#`. Shorthand works too. */
	colour?: string;
	color?: string;
	tolerance?: number;
	softness?: number;
	spill?: number;
}

/**
 * Makes one colour transparent - the green screen.
 *
 * **This is the first filter in the library whose output is a real alpha
 * channel.** Everything else writes 255 and moves on; this one writes the frame
 * back unchanged and spends its whole effort on the fourth byte. That has a
 * consequence worth knowing before building a chain around it: almost every
 * filter downstream will flatten the alpha it just wrote. `Blur` carries alpha
 * through, and so does this - the rest do not, and the `alpha-out` trait exists
 * to say so where a palette can show it.
 *
 * **The match happens in the U-V plane of YUV, not in RGB**, which is the whole
 * point of the word chroma. A green screen is never one colour - it is lit
 * unevenly, it has folds and it has shadows - and dropping luma is what lets one
 * tolerance cover the whole screen instead of needing a different one per fold.
 *
 * It is worth being exact about how much that buys, because the loose version of
 * the claim is wrong. U and V are *linear* in RGB, so what they are perfectly
 * blind to is a neutral **offset**: the coefficients of each sum to zero, so
 * adding the same amount to all three channels moves a pixel not at all in
 * chroma. Haze, a lift, ambient fill, a raised black point - none of them shift
 * the match by a byte. What does still move it is a neutral **gain**, since
 * halving all three channels halves the chroma too, and a screen at half
 * brightness lands about 50 from one at full. So this is roughly twice as
 * forgiving of uneven light as an RGB distance would be, not infinitely - the
 * far side of a deep fold still wants some tolerance spent on it.
 *
 * The cost of that is real and you should know it: **luma is dropped, so black,
 * white and every grey between them are the same colour here.** Keying `000000`
 * keys the sky as readily as the shadows. That is not a bug to be worked around
 * with a fudge factor, it is what keying on chroma means - to key a *shade*
 * rather than a hue, `ValueThreshold` into `Mask` is the chain that does it.
 *
 * That is also why the default key is `00b140`, the green a screen is actually
 * painted, rather than a pure `00ff00` nobody has ever stood in front of. Two
 * measurements decide it. A lit screen photographs around 35 from `00b140` and
 * 81 from pure green, so against pure green the default tolerance would key
 * nothing at all. And because every neutral colour sits at the origin of the
 * chroma plane, **the distance from a key to every grey in the frame is just
 * that key's own saturation** - 100 for `00b140`, comfortably outside the ramp,
 * where a paler screen green like `3cb44b` measures 69 and starts dissolving
 * the greys along with the screen.
 *
 * `spill` is the other half of a real key and the only thing here that touches
 * colour. Light bounces off a green screen onto whatever is standing in front of
 * it, and the fringe that leaves is inside the region being kept, so no amount
 * of tolerance reaches it. Suppression pulls out whatever part of a pixel's
 * chroma points along the key's own direction, leaving the rest, which is why
 * one formula handles a green screen and a blue one without being told which.
 * It defaults to 0 because writing alpha is what this filter promises and
 * writing colour is a second act.
 */
export class ChromaKey extends Filter {
	static override shader = /* glsl */ `
uniform vec3 u_colour;
uniform float u_tolerance;
uniform float u_softness;
uniform float u_spill;

void main(){
	vec4 here = srcPixel(vUv);

	vec2 key = rgb2yuv(u_colour).yz;
	vec3 yuv = rgb2yuv(here.rgb);
	float away = length(yuv.yz - key);

	//1 outside the ramp, 0 inside the tolerance, and smoothly between. The max
	//keeps a softness of 0 a hard cut rather than a division by zero.
	float keep = clamp((away - u_tolerance) / max(u_softness, 0.0001), 0.0, 1.0);

	vec3 rgb = here.rgb;
	float reach = length(key);
	if(u_spill > 0.0 && reach > 0.0001){
		vec2 axis = key / reach;
		float along = dot(yuv.yz, axis);
		if(along > 0.0){
			yuv.yz -= axis * along * u_spill;
			rgb = yuv2rgb(yuv);
		}
	}

	writePixel(vec4(toByte3(rgb), toByte(here.a * keep)));
}
`;

	static override schema: FilterSchema = {
		colour: {
			type: 'colour',
			label: 'Key colour',
			default: '00b140',
			description: 'The colour to make transparent, as six hex digits. Only its hue and saturation are used - see Tolerance. The default is the green screens are actually painted, not pure green.'
		},
		tolerance: {
			type: 'int',
			label: 'Tolerance',
			min: 0,
			max: 255,
			step: 1,
			default: 60,
			description: 'How far a pixel may sit from the key colour and still go fully transparent, measured across hue and saturation only. Brightness is ignored, so a shadow on the screen keys the same as a lit patch - and every grey counts as the same colour.'
		},
		softness: {
			type: 'int',
			label: 'Softness',
			min: 0,
			max: 255,
			step: 1,
			default: 30,
			description: 'Extra distance beyond the tolerance over which transparency fades back in, so the cut-out has an edge rather than a staircase. 0 is a hard cut.'
		},
		spill: {
			type: 'float',
			label: 'Spill suppression',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0,
			description: 'Removes the key colour bounced onto what is kept - the green fringe around a subject. 1 takes out all of it. The one option here that changes colour rather than transparency.'
		}
	};

	override properties: {
		colour: string;
		tolerance: number;
		softness: number;
		spill: number;
	};

	constructor(options: ChromaKeyOptions = {}) {
		super(options);
		this.properties = {
			//`color` alongside `colour` for the same reason Fill takes both
			colour: options.colour ?? options.color ?? '00b140',
			tolerance: options.tolerance ?? 60,
			softness: options.softness ?? 30,
			spill: options.spill ?? 0
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const { tolerance, softness, spill } = this.properties;

		const [keyRed, keyGreen, keyBlue] = Operations.hexToRGB(this.properties.colour);
		const key = Operations.RGBtoYUV({ r: keyRed, g: keyGreen, b: keyBlue });
		const reach = Math.hypot(key.u, key.v);
		const suppressing = spill > 0 && reach > 0.0001;

		for(let i = 0; i < frame.width*frame.height*4; i += 4){
			const yuv = Operations.RGBtoYUV({ r: frame.data[i], g: frame.data[i+1], b: frame.data[i+2] });
			const away = Math.hypot(yuv.u - key.u, yuv.v - key.v);
			const keep = Math.min(1, Math.max(0, (away - tolerance) / Math.max(softness, 0.0001)));

			let red = frame.data[i];
			let green = frame.data[i+1];
			let blue = frame.data[i+2];

			if(suppressing){
				const along = (yuv.u*key.u + yuv.v*key.v) / reach;
				if(along > 0){
					yuv.u -= (key.u / reach) * along * spill;
					yuv.v -= (key.v / reach) * along * spill;
					const rgb = Operations.YUVtoRGB(yuv);
					red = rgb.r;
					green = rgb.g;
					blue = rgb.b;
				}
			}

			output.data[i]   = red;
			output.data[i+1] = green;
			output.data[i+2] = blue;
			//multiplied rather than assigned, so an already-transparent pixel
			//stays transparent instead of being handed back its alpha
			output.data[i+3] = frame.data[i+3] * keep;
		}

		return output;
	}
}
