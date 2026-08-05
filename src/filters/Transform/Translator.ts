//Translator
//Translates the image by the percentages specified

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface TranslatorOptions extends FilterOptions {
	horizontal?: number;
	vertical?: number;
	speed?: number;
}

/**
 * Shifts the image, wrapping at the edges - and optionally keeps shifting.
 *
 * `speed` scrolls along the offset rather than adding a direction of its own,
 * so the two properties you already set to aim it are the ones that aim the
 * motion. The consequence worth knowing is that they double as the step size:
 * a very small offset drifts very slowly, because the offset *is* the distance
 * covered per second.
 *
 * The travelled distance is wrapped into a single frame before it is used. The
 * motion is identical either way, since the result wraps regardless - but it
 * keeps the number small, and a number that grows with the clock loses its
 * fractional precision on the GPU where `uTime` is a 32-bit float. Left to
 * grow, the two backends would eventually disagree about which side of a whole
 * pixel the offset fell on, which shifts the entire picture by one.
 */
export class Translator extends Filter {
	//Only when it is scrolling; see animated.
	static override varying = true;

	static override animated(filter: any): boolean {
		return filter.properties.speed !== 0;
	}

	static override shader = /* glsl */ `
uniform float u_horizontal;
uniform float u_vertical;
uniform float u_speed;

//Distance travelled so far along one axis, wrapped into one frame.
float scrolled(float fraction){
	float travel = fraction * u_speed * (uTime / 1000.0);
	return travel - floor(travel);
}

void main(){
	//The CPU scatters by +ceil(size * fraction), so gathering means subtracting
	//the same offset and wrapping.
	ivec2 size = ivec2(uSize);
	int dx = int(ceil(uSize.x * (u_horizontal + scrolled(u_horizontal))));
	int dy = int(ceil(uSize.y * (u_vertical + scrolled(u_vertical))));

	ivec2 p = outPixel() - ivec2(dx, dy);
	p.x = ((p.x % size.x) + size.x) % size.x;
	p.y = ((p.y % size.y) + size.y) % size.y;

	writeRGB(texelFetch(uSrc, p, 0).rgb * 255.0);
}
`;

	static override schema: FilterSchema = {
		horizontal: { type: 'float', label: 'Horizontal', min: -1, max: 1, step: 0.01, default: 0.5, description: 'Fraction of the frame width, wrapping at the edges.' },
		vertical: { type: 'float', label: 'Vertical', min: -1, max: 1, step: 0.01, default: 0.5, description: 'Fraction of the frame height, wrapping at the edges.' },
		speed: { type: 'float', label: 'Speed', min: -4, max: 4, step: 0.05, default: 0, description: 'Scrolls along the offset, that many times over per second. 0 holds still; the offset sets the direction and how far one second carries it.' }
	};

	override properties: {
		horizontal: number;
		vertical: number;
		speed: number;
	};

	constructor(options: TranslatorOptions = {}) {
		super(options);
		//`options.horizontal || 0.5` turned a deliberate 0 into 0.5, so "no shift" was unreachable
		this.properties = {
			horizontal: Operations.clamp(options.horizontal === undefined ? 0.5 : options.horizontal, -1, 1),
			vertical: Operations.clamp(options.vertical === undefined ? 0.5 : options.vertical, -1, 1),
			speed: options.speed === undefined ? 0 : options.speed
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		const seconds = this.now() / 1000;
		const scrolled = (fraction: number) => {
			const travel = fraction * this.properties.speed * seconds;
			return travel - Math.floor(travel);
		};

		let xTranslate = Math.ceil(frame.width * (this.properties.horizontal + scrolled(this.properties.horizontal)));
		let yTranslate = Math.ceil(frame.height * (this.properties.vertical + scrolled(this.properties.vertical)));

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let from = (y*frame.width + x)*4;

				//A modulo rather than one add-or-subtract. That was only ever correct
				//because the offset was clamped to a single frame; scrolling carries
				//it past that, and one adjustment then leaves the index off the end
				//of the row - reading a neighbouring line, or nothing at all.
				const toX = ((x + xTranslate) % frame.width + frame.width) % frame.width;
				const toY = ((y + yTranslate) % frame.height + frame.height) % frame.height;
				let to = (toY*frame.width + toX)*4;

				output.data[to] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];

				output.data[to+3] = 255;
			}
		}

		return output;
	}
}
