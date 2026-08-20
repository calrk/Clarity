//Displace object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type DisplaceEdges = 'clamp' | 'wrap';

export interface DisplaceOptions extends FilterOptions {
	/** How far a fully tilted pixel moves, in pixels. */
	amount?: number;
	/** What to read where the offset points outside the frame. */
	edges?: DisplaceEdges;
}

/**
 * Moves every pixel by an amount read out of a second image.
 *
 * The counterpart to {@link Wave}, and the reason it is worth having next to
 * one: Wave answers "where should this pixel read from" with a formula, so
 * every row gets the same offset as the row one wavelength away, forever. Push
 * the amplitude far enough to be interesting and the sine is the only thing
 * left in the picture. This answers with a *picture* instead - the second frame
 * - so the offsets can be as irregular as whatever drew them.
 *
 * Red is the horizontal offset and green the vertical, with 128 meaning "stay
 * put": above it reads from further right and further down, below it from
 * further left and up. That is not an encoding invented here, it is the one
 * {@link NormalGenerator} already writes, which is the point - the whole Height
 * Map family is a field factory, and this is what consumes what it makes.
 *
 * So a *height* map does not go in here directly. It would work, in that
 * something would happen, but a greyscale image has red equal to green and the
 * whole frame would shear along a single diagonal. Put NormalGenerator between
 * them and the slopes become a real two-axis field. Turning heights into
 * vectors is a stage rather than a mode on this filter, for the same reason
 * Woodgrain emits grey and leaves the colour to GradientMap.
 *
 * Samples bilinearly rather than snapping to the nearest texel. Wave floors its
 * offset because a sine is smooth and the seam lands somewhere different on
 * every row; an arbitrary field has flat regions, and across one of those a
 * nearest-texel read quantises the offset to whole pixels and lays visible
 * stripes over the result.
 *
 * Alpha travels with the pixel it belongs to, so a displaced sprite is a
 * displaced *shape* rather than a rectangle - see `Filter.dual`.
 */
export class Displace extends Filter {
	static override dual = true;

	static override shader = /* glsl */ `
uniform float u_amount;
uniform float u_edges;

/** One source texel, colour scaled by its own alpha, alpha in 0-1. */
vec4 premultiplied(ivec2 p){
	vec4 texel = texelFetch(uSrc, p, 0) * 255.0;
	float a = texel.a / 255.0;
	return vec4(texel.rgb * a, a);
}

//0 clamp, 1 wrap - the schema order
ivec2 sampleAt(ivec2 p, ivec2 size){
	if(u_edges > 0.5){
		return ivec2(
			((p.x % size.x) + size.x) % size.x,
			((p.y % size.y) + size.y) % size.y
		);
	}
	return clamp(p, ivec2(0), size - 1);
}

void main(){
	ivec2 size = ivec2(uSize);
	ivec2 p = outPixel();

	//By uv rather than by texel, so a field of a different size stretches to
	//fit - which is what the CPU path gets for free from Filter.process
	//resampling the second frame before doProcess ever sees it.
	vec4 field = src2Pixel(vUv);
	float dx = clamp((field.r - 128.0) / 127.0, -1.0, 1.0) * u_amount;
	float dy = clamp((field.g - 128.0) / 127.0, -1.0, 1.0) * u_amount;

	float fx = float(p.x) + dx;
	float fy = float(p.y) + dy;
	float x0 = floor(fx);
	float y0 = floor(fy);
	float tx = fx - x0;
	float ty = fy - y0;

	int ix = int(x0);
	int iy = int(y0);

	//Premultiplied, so the interpolation cannot drag a transparent texel's colour
	//into a solid one - see doProcess.
	vec4 a = premultiplied(sampleAt(ivec2(ix,     iy),     size));
	vec4 b = premultiplied(sampleAt(ivec2(ix + 1, iy),     size));
	vec4 c = premultiplied(sampleAt(ivec2(ix,     iy + 1), size));
	vec4 d = premultiplied(sampleAt(ivec2(ix + 1, iy + 1), size));

	vec4 top = mix(a, b, tx);
	vec4 bottom = mix(c, d, tx);
	vec4 gathered = mix(top, bottom, ty);

	writePixel(vec4(
		gathered.a > 0.0 ? gathered.rgb / gathered.a : vec3(0.0),
		gathered.a * 255.0
	));
}
`;

	static override schema: FilterSchema = {
		amount: { type: 'float', label: 'Amount', min: 0, max: 200, step: 1, default: 20, description: 'How far a fully tilted pixel travels, in pixels. The field decides the direction; this decides the scale.' },
		edges: {
			type: 'select',
			label: 'Edges',
			default: 'clamp',
			description: 'What to read where an offset points outside the frame.',
			options: [
				{ value: 'clamp', label: 'Clamp - smear the edge pixel' },
				{ value: 'wrap', label: 'Wrap - read from the opposite side' }
			]
		}
	};

	override properties: {
		amount: number;
		edges: DisplaceEdges;
	};

	constructor(options: DisplaceOptions = {}) {
		super(options);
		this.properties = {
			//`?? 20` rather than `|| 20`, because 0 is a legal amount and means
			//"off" - a filter you can dial to nothing is how you compare against
			//the undisplaced picture without removing it from the chain.
			amount: options.amount ?? 20,
			edges: options.edges ?? 'clamp'
		};
	}

	override doProcess(frame: ImageData, field?: ImageData): ImageData {
		const { width, height } = frame;
		const output = createImageData(width, height);

		//A dual-input filter with nothing on its second input. Pipeline will not
		//call it that way, but a filter used on its own can be, and shearing the
		//picture by whatever happened to be in memory is worse than doing nothing.
		if (!field) {
			output.data.set(frame.data);
			return output;
		}

		const { amount, edges } = this.properties;
		const wrap = edges === 'wrap';

		//Hoisted rather than branching inside the loop: `edges` cannot change
		//while a frame is being processed, and this runs four times per pixel.
		const atX = wrap
			? (x: number) => ((x % width) + width) % width
			: (x: number) => (x < 0 ? 0 : x > width - 1 ? width - 1 : x);
		const atY = wrap
			? (y: number) => ((y % height) + height) % height
			: (y: number) => (y < 0 ? 0 : y > height - 1 ? height - 1 : y);

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const to = (y * width + x) * 4;

				//The field has already been resampled to this frame's size by
				//Filter.process, so it is safe to walk both by the same offset.
				const dx = clampUnit((field.data[to] - 128) / 127) * amount;
				const dy = clampUnit((field.data[to + 1] - 128) / 127) * amount;

				const fx = x + dx;
				const fy = y + dy;
				const x0 = Math.floor(fx);
				const y0 = Math.floor(fy);
				const tx = fx - x0;
				const ty = fy - y0;

				const left = atX(x0);
				const right = atX(x0 + 1);
				const top = atY(y0);
				const bottom = atY(y0 + 1);

				const a = (top * width + left) * 4;
				const b = (top * width + right) * 4;
				const c = (bottom * width + left) * 4;
				const d = (bottom * width + right) * 4;

				//Alpha is gathered through the same tap as the colour, rather than
				//being written as 255. Displace *moves* pixels, and how transparent a
				//pixel is belongs to it exactly as much as its colour does - a sprite
				//pushed sideways that came back a full rectangle would be the bug
				//`Multiply` had, in a filter that is even more obviously about shape.
				//`Filter.dual` carries the family rule this reads one step further.
				//
				//Premultiplied before interpolating and divided back out after, for the
				//reason `Stamper` gives at length: straight colour from a fully
				//transparent pixel is meaningless, and interpolating it puts a halo of
				//that colour round every edge an offset crosses. An opaque frame
				//multiplies and divides by exactly 1, so nothing that displaces a
				//photograph moved by a byte.
				const aa = frame.data[a + 3] / 255;
				const ab = frame.data[b + 3] / 255;
				const ac = frame.data[c + 3] / 255;
				const ad = frame.data[d + 3] / 255;

				const alpha = lerp(lerp(aa, ab, tx), lerp(ac, ad, tx), ty);

				for (let channel = 0; channel < 3; channel++) {
					const upper = lerp(frame.data[a + channel]*aa, frame.data[b + channel]*ab, tx);
					const lower = lerp(frame.data[c + channel]*ac, frame.data[d + channel]*ad, tx);
					const gathered = lerp(upper, lower, ty);
					output.data[to + channel] = alpha > 0 ? gathered/alpha : 0;
				}
				output.data[to + 3] = alpha*255;
			}
		}

		return output;
	}
}

/** GLSL `mix`, so the two paths interpolate identically. */
function lerp(from: number, to: number, at: number): number {
	return from + (to - from) * at;
}

function clampUnit(value: number): number {
	return value < -1 ? -1 : value > 1 ? 1 : value;
}
