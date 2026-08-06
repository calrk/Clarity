//Fill object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import { normaliseHex } from '../../core/schema.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface FillOptions extends FilterOptions {
	/** Six hex digits, with or without the leading `#`. Shorthand works too. */
	colour?: string;
	color?: string;
	/** The same colour as `[r, g, b]`, 0-255 each. */
	rgb?: readonly [number, number, number];
	/** The same colour as `[hue, saturation, value]` - degrees, then 0-1 twice. */
	hsv?: readonly [number, number, number];
}

/**
 * Fills the frame with one colour.
 *
 * This replaces `FillRGB` and `FillHSV`, which were the same filter twice with
 * a different way of typing the colour in. That difference is a property of the
 * *control*, not of the filter - the same distinction #8 drew when it deleted
 * every `doCreateControls` and kept the schema - so it belongs in the options
 * bag rather than in the library's list of filters.
 *
 * So the constructor takes whichever spelling suits the caller:
 *
 * ```js
 * new Fill({ colour: 'ff8844' })
 * new Fill({ rgb: [255, 136, 68] })
 * new Fill({ hsv: [20, 0.73, 1] })
 * ```
 *
 * and all three collapse immediately into one `colour` property. Nothing
 * downstream ever learns which was used: the panel shows one swatch, the chain
 * says `Fill,colour=ff8844`, and the shader binds one `vec3`.
 *
 * That collapse is the whole design. A `model` *property* would have been a
 * mode - carried by the filter, rendered by every host app, spelled in every
 * link, and branched on by everything that reads a chain. Alternative
 * constructor keys are not a mode, because they do not survive construction.
 *
 * The one consequence worth knowing: `setProperty` is the single live write
 * path, so the triplet forms are construction-time sugar rather than a second
 * runtime API. Changing the colour later is always hex, and
 * `Operations.HSVtoRGB` and `Operations.rgbToHex` are exported for anyone
 * driving it from somewhere else.
 */
export class Fill extends Filter {
	static override shader = /* glsl */ `
uniform vec3 u_colour;

void main(){
	writeRGB(u_colour);
}
`;

	static override schema: FilterSchema = {
		colour: {
			type: 'colour',
			label: 'Colour',
			default: '000000',
			description: 'The colour to fill with, as six hex digits. A host app can render this as a colour picker.'
		}
	};

	override properties: {
		colour: string;
	};

	constructor(options: FillOptions = {}) {
		super(options);

		//Two spellings of the same thing is a caller bug, not user input, so it
		//throws rather than picking one - the split setProperty already makes
		//between a bad key (throw) and a bad value (clamp).
		const given = (['colour', 'color', 'rgb', 'hsv'] as const).filter((key) => options[key] !== undefined);
		if (given.length > 1) {
			throw new Error(`Fill takes one of colour, color, rgb or hsv - got ${given.join(' and ')}`);
		}

		this.properties = {
			colour: Fill.resolve(options)
		};
	}

	/** Whichever spelling was given, as six hex digits. */
	private static resolve(options: FillOptions): string {
		if (options.rgb) {
			return Operations.rgbToHex([...options.rgb]);
		}
		if (options.hsv) {
			return Operations.rgbToHex(Operations.HSVtoRGB([...options.hsv]));
		}
		//normalised rather than validated, so a malformed string lands on the
		//default instead of throwing - it may well have come from a hand-edited link
		return normaliseHex(options.colour || options.color, '000000');
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const [red, green, blue] = Operations.hexToRGB(this.properties.colour);

		for (let i = 0; i < frame.width * frame.height * 4; i += 4) {
			output.data[i] = red;
			output.data[i + 1] = green;
			output.data[i + 2] = blue;
			output.data[i + 3] = 255;
		}

		return output;
	}
}
