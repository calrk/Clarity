//Chromatic Aberration
//Displaces the red and green channels in opposite directions.

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
 * Lens fringing: red goes one way, green the other, blue stays put.
 *
 * Was `ChannelSeparate`, and had two problems the rename is a good moment to
 * fix. It *scattered* - each source pixel wrote to a computed destination -
 * which leaves holes wherever the displacement steps by more than one, so two
 * further passes existed only to fill them by averaging neighbours. Gathering
 * instead (each output pixel reads where its colour came from) has no holes, so
 * both passes are gone, and it is the form a fragment shader can run.
 *
 * The ramp was also inverted. It was `1 - |x/w - 0.5| * 2`, which is maximum
 * displacement at the centre of the frame falling to none at the edges. Real
 * chromatic aberration is a lens effect: zero on the optical axis, growing
 * toward the corners. Dropping the `1 -` is the whole fix.
 */
export class ChromaticAberration extends Filter {
	static override shader = /* glsl */ `
uniform float u_xdistance;
uniform float u_ydistance;
uniform float u_fixed;

//See the CPU's shiftFor: integer arithmetic, so the two agree exactly on the
//half-integers rather than disagreeing wherever float32 rounds the ramp the
//other way. A one-off there is a whole pixel of displacement, not a rounding
//error, and it showed up on 4% of the frame.
int shiftFor(int position, int size, int distance){
	if(u_fixed > 0.5){
		return distance;
	}
	int n = abs(2 * position - size);
	int magnitude = (2 * n * abs(distance) + size) / (2 * size);
	return distance < 0 ? -magnitude : magnitude;
}

void main(){
	ivec2 p = outPixel();
	ivec2 size = ivec2(uSize);
	ivec2 shift = ivec2(
		shiftFor(p.x, size.x, int(u_xdistance)),
		shiftFor(p.y, size.y, int(u_ydistance))
	);

	writeRGB(vec3(
		srcTexel(p - shift).r,
		srcTexel(p + shift).g,
		srcTexel(p).b
	));
}
`;

	static override schema: FilterSchema = {
		xdistance: { type: 'int', label: 'X distance', min: -100, max: 100, step: 1, default: 8, description: 'How far red and blue pull apart horizontally, in pixels at the frame edge.' },
		ydistance: { type: 'int', label: 'Y distance', min: -100, max: 100, step: 1, default: 0, description: 'The same displacement vertically. Green never moves.' },
		fixed: { type: 'bool', label: 'Fixed', default: false, description: 'Displace uniformly rather than growing toward the edges.' }
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

		for(let y = 0; y < frame.height; y++){
			let yShift = this.shiftFor(y, frame.height, yDistance);

			for(let x = 0; x < frame.width; x++){
				let xShift = this.shiftFor(x, frame.width, xDistance);

				let i = (y*frame.width + x)*4;

				output.data[i  ] = frame.data[this.sample(frame, x - xShift, y - yShift)];
				output.data[i+1] = frame.data[this.sample(frame, x + xShift, y + yShift) + 1];
				output.data[i+2] = frame.data[i+2];
				output.data[i+3] = 255;
			}
		}

		return output;
	}

	/**
	 * Displacement at one coordinate: none at the centre, `distance` at the edge.
	 *
	 * `round(n * |d| / size)` written as integer arithmetic. Spelled that way
	 * because the shader has to land on the same integer, and the obvious
	 * floating-point form does not: `|x/w - 0.5| * 2 * d` is a half-integer for
	 * whole rows of the frame, and float32 rounds those the other way from
	 * float64 often enough to displace 4% of the pixels by a whole pixel.
	 */
	private shiftFor(position: number, size: number, distance: number): number {
		if(this.properties.fixed){
			return distance;
		}
		let n = Math.abs(2*position - size);
		let magnitude = Math.floor((2*n*Math.abs(distance) + size) / (2*size));
		return distance < 0 ? -magnitude : magnitude;
	}

	/** Byte offset of a pixel, clamped to the frame - matching `srcTexel`. */
	private sample(frame: ImageData, x: number, y: number): number {
		let clampedX = Math.min(Math.max(x, 0), frame.width - 1);
		let clampedY = Math.min(Math.max(y, 0), frame.height - 1);
		return (clampedY*frame.width + clampedX)*4;
	}
}
