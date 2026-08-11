//Chromatic Aberration
//Magnifies the three channels by slightly different amounts, so they separate
//toward the edges of the frame.

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface ChromaticAberrationOptions extends FilterOptions {
	xdistance?: number;
	ydistance?: number;
	fixed?: boolean;
}

/**
 * Lens fringing: the three channels are magnified by slightly different
 * amounts, so they separate toward the edges of the frame and agree at its
 * centre.
 *
 * Was `ChannelSeparate`, and every version of it since has been fixing a
 * different part of the same idea.
 *
 * It *scattered* - each source pixel wrote to a computed destination - which
 * leaves holes wherever the displacement steps by more than one, so two further
 * passes existed only to fill them by averaging neighbours. Gathering instead
 * (each output pixel reads where its colour came from) has no holes, so both
 * passes are gone, and it is the form a fragment shader can run.
 *
 * The ramp was inverted. It was `1 - |x/w - 0.5| * 2`, which is maximum
 * displacement at the *centre* of the frame falling to none at the edges. Real
 * chromatic aberration is a lens effect: zero on the optical axis, growing
 * toward the corners.
 *
 * **And then the ramp was not radial**, which is the fix below and the
 * interesting one, because the artifact everybody could see and the error
 * nobody could turned out to be the same bug.
 *
 * `shiftFor` took `abs(2 * position - size)`, which is the right *magnitude* -
 * a V, zero at the centre and `distance` at both edges - but throws away which
 * side of the centre the pixel is on. So the displacement pointed the same way
 * across the whole frame, and one half of every image fringed backwards. A lens
 * disperses *radially*: red leans left on the left of frame and right on the
 * right.
 *
 * The visible symptom was a stripe. With a single direction, one channel walks
 * off the left edge and another off the right, `srcTexel` clamps, and the
 * outermost column gets smeared into a flat band of colour `distance` pixels
 * wide - which is not lens fringing, it is the gather running out of picture.
 *
 * Restoring the sign is what makes that fixable, because "inward" only means
 * something once the displacement is radial. **Every channel now reads inward
 * or not at all**, so no sample can leave the frame and there is nothing to
 * clamp:
 *
 * ```
 *   red   reads p            green reads p - s        blue reads p - 2s
 * ```
 *
 * Nothing is lost by biasing them that way. Lateral chromatic aberration *is*
 * differential magnification, and the absolute magnification is arbitrary - the
 * eye sees the separation *between* the channels, which is `2s` from red to
 * blue with green halfway, exactly as it would be with red pulled in and blue
 * pushed out. All that changes is which channel is the geometric datum, and
 * picking the one that never leaves the frame costs a magnification of at most
 * `2 * distance` pixels at the very corner.
 *
 * Red is the datum rather than green because that is also the physical order.
 * Longest wavelength refracts least, so red is deviated least and blue most,
 * with green between them. The old arrangement moved red and green and pinned
 * *blue*, which is the one ordering a lens cannot produce - and the schema
 * descriptions had been claiming red-and-blue for some time regardless.
 *
 * **A negative distance swaps red and blue rather than reversing the gather.**
 * That is the whole of what "disperse the other way" can mean here: putting the
 * sign back into the displacement would send every channel outward again and
 * hand back the smear, and it is unnecessary, because red outside blue and blue
 * outside red are the same two pictures. It is decided per axis, so an x and a
 * y of opposite sign each do what they were asked.
 *
 * One degeneracy, unclamped on purpose: blue's `p - 2s` stops being monotonic
 * once `distance` reaches a quarter of the frame's smaller dimension, and at
 * exactly that point every output pixel reads the centre. Capping it would
 * silently change what an already-shared link means, so it is documented rather
 * than prevented; the useful range is a long way below it.
 */
export class ChromaticAberration extends Filter {
	static override shader = /* glsl */ `
uniform float u_xdistance;
uniform float u_ydistance;
uniform float u_fixed;

//Outward-signed and never negative in magnitude, so subtracting it always
//reads toward the centre. The sign of the distance is deliberately not in
//here - see the channel order in main.
//
//See the CPU's shiftFor: integer arithmetic, so the two agree exactly on the
//half-integers rather than disagreeing wherever float32 rounds the ramp the
//other way. A one-off there is a whole pixel of displacement, not a rounding
//error, and it showed up on 4% of the frame. The side is applied *after* the
//division for the same reason - a signed numerator would put the hazard back
//from the other end, since GLSL truncates integer division toward zero where
//Math.floor rounds down, and the two would then disagree over the whole left
//half of the frame.
int shiftFor(int position, int size, int distance){
	if(u_fixed > 0.5){
		return abs(distance);
	}
	int n = abs(2 * position - size);
	int magnitude = (2 * n * abs(distance) + size) / (2 * size);
	return (2 * position - size < 0 ? -1 : 1) * magnitude;
}

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);
	ivec2 distance = ivec2(int(u_xdistance), int(u_ydistance));

	ivec2 shift = ivec2(
		shiftFor(p.x, size.x, distance.x),
		shiftFor(p.y, size.y, distance.y)
	);

	//Green is always the midpoint; the sign picks which of red and blue sits
	//outside it. Per axis, so an x and a y of opposite sign each disperse the
	//way they were asked to.
	ivec2 red  = ivec2(distance.x < 0 ? 2 : 0, distance.y < 0 ? 2 : 0);
	ivec2 blue = ivec2(2, 2) - red;

	writeRGB(vec3(
		srcTexel(p - red * shift).r,
		srcTexel(p - shift).g,
		srcTexel(p - blue * shift).b
	));
}
`;

	static override schema: FilterSchema = {
		xdistance: { type: 'int', label: 'X distance', min: -100, max: 100, step: 1, default: 8, description: 'How far the outer channel is displaced horizontally at the frame edge, with green half as far and the inner one not at all. Zero at the centre of the frame. Negative puts red outside blue instead.' },
		ydistance: { type: 'int', label: 'Y distance', min: -100, max: 100, step: 1, default: 0, description: 'The same dispersion vertically, and signed independently of the horizontal.' },
		fixed: { type: 'bool', label: 'Fixed', default: false, description: 'Separate the channels by the same amount everywhere instead of growing toward the edges. Not what a lens does, and the one mode that can still smear a frame edge, since a constant offset has to read from outside somewhere.' }
	};

	override properties: {
		xdistance: number;
		ydistance: number;
		fixed: boolean;
	};

	constructor(options: ChromaticAberrationOptions = {}) {
		super(options);
		this.properties = {
			xdistance: options.xdistance === undefined ? 8 : options.xdistance,
			ydistance: options.ydistance || 0,
			fixed: options.fixed || false,
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		let xDistance = this.properties.xdistance;
		let yDistance = this.properties.ydistance;

		//which of red and blue sits outside green, per axis
		let xRed = xDistance < 0 ? 2 : 0;
		let yRed = yDistance < 0 ? 2 : 0;
		let xBlue = 2 - xRed;
		let yBlue = 2 - yRed;

		for(let y = 0; y < frame.height; y++){
			let yShift = this.shiftFor(y, frame.height, yDistance);

			for(let x = 0; x < frame.width; x++){
				let xShift = this.shiftFor(x, frame.width, xDistance);

				let i = (y*frame.width + x)*4;

				output.data[i  ] = frame.data[this.sample(frame, x - xRed*xShift,  y - yRed*yShift)];
				output.data[i+1] = frame.data[this.sample(frame, x - xShift,       y - yShift) + 1];
				output.data[i+2] = frame.data[this.sample(frame, x - xBlue*xShift, y - yBlue*yShift) + 2];
				output.data[i+3] = 255;
			}
		}

		return output;
	}

	/**
	 * Displacement at one coordinate, signed *outward*: none at the centre,
	 * `|distance|` at either edge, and pointing away from the centre on both
	 * sides. Subtracting it therefore always reads toward the centre.
	 *
	 * The sign of `distance` is not in here on purpose. Putting it back would
	 * make a negative distance read outward again, which is the smear this
	 * filter just stopped producing - so reversing the dispersion is done by
	 * exchanging red and blue in `doProcess` instead, which is the same picture
	 * with none of the clamping.
	 *
	 * `round(n * |d| / size)` written as integer arithmetic. Spelled that way
	 * because the shader has to land on the same integer, and the obvious
	 * floating-point form does not: `|x/w - 0.5| * 2 * d` is a half-integer for
	 * whole rows of the frame, and float32 rounds those the other way from
	 * float64 often enough to displace 4% of the pixels by a whole pixel.
	 *
	 * The side is applied after the division for the same reason. Folding it in
	 * as a signed numerator would reintroduce the hazard from the other end,
	 * since Math.floor rounds down and GLSL's integer division truncates toward
	 * zero - identical on positives, a pixel apart on negatives, which is the
	 * entire left half of the frame.
	 */
	private shiftFor(position: number, size: number, distance: number): number {
		if(this.properties.fixed){
			return Math.abs(distance);
		}
		let n = Math.abs(2*position - size);
		let magnitude = Math.floor((2*n*Math.abs(distance) + size) / (2*size));
		return (2*position - size < 0 ? -1 : 1) * magnitude;
	}

	/** Byte offset of a pixel, clamped to the frame - matching `srcTexel`. */
	private sample(frame: ImageData, x: number, y: number): number {
		let clampedX = Math.min(Math.max(x, 0), frame.width - 1);
		let clampedY = Math.min(Math.max(y, 0), frame.height - 1);
		return (clampedY*frame.width + clampedX)*4;
	}
}
