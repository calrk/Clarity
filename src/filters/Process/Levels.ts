//Levels object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface LevelsOptions extends FilterOptions {
	black?: number;
	white?: number;
	gamma?: number;
}

/**
 * Black point, white point and gamma - the everyday contrast control.
 *
 * The library had no brightness or contrast anywhere before this: `hsvShifter`
 * multiplies value and that was the whole of it, which can only scale, never
 * stretch. Everything below `black` becomes black, everything above `white`
 * becomes white, and the range between is spread across the full 0-255.
 *
 * `gamma` is applied after that stretch, as `pow(t, 1 / gamma)`, so above 1
 * lifts the midtones and below 1 drops them while leaving both ends pinned -
 * the same sense as the middle slider in a Levels dialog. Doing it after rather
 * than before is what makes the two ends stay put.
 */
export class Levels extends Filter {
	static override shader = /* glsl */ `
uniform float u_black;
uniform float u_white;
uniform float u_gamma;

void main(){
	vec4 c = srcPixel(vUv);

	//a collapsed or inverted range would divide by zero or negative; treating it
	//as a hard threshold at the black point is the sensible limit of the ramp
	float span = u_white - u_black;
	vec3 t = span <= 0.0
		? step(vec3(u_black), c.rgb)
		: clamp((c.rgb - u_black) / span, 0.0, 1.0);

	writePixel(vec4(pow(t, vec3(1.0 / u_gamma)) * 255.0, c.a));
}
`;

	static override schema: FilterSchema = {
		black: { type: 'int', label: 'Black point', min: 0, max: 255, step: 1, default: 0, description: 'Everything this dark or darker becomes black.' },
		white: { type: 'int', label: 'White point', min: 0, max: 255, step: 1, default: 255, description: 'Everything this bright or brighter becomes white.' },
		gamma: { type: 'float', label: 'Gamma', min: 0.1, max: 5, step: 0.05, default: 1, description: 'Midtones only: above 1 brightens, below 1 darkens, and both ends stay put.' }
	};

	override properties: {
		black: number;
		white: number;
		gamma: number;
	};

	constructor(options: LevelsOptions = {}) {
		super(options);
		this.properties = {
			black: options.black === undefined ? 0 : options.black,
			white: options.white === undefined ? 255 : options.white,
			gamma: options.gamma === undefined ? 1 : options.gamma
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const { black, white, gamma } = this.properties;
		const span = white - black;
		const power = 1 / gamma;

		for(let i = 0; i < frame.data.length; i += 4){
			for(let c = 0; c < 3; c++){
				const value = frame.data[i + c];
				const t = span <= 0
					? (value >= black ? 1 : 0)
					: Math.min(1, Math.max(0, (value - black) / span));
				output.data[i + c] = Math.pow(t, power) * 255;
			}
			output.data[i + 3] = frame.data[i + 3];
		}

		return output;
	}
}
