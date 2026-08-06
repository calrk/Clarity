//Halftone object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type HalftoneColour = 'sampled' | 'ink' | 'cmyk' | 'rgb';
export type HalftoneGround = 'white' | 'black';

/** Mode order, matching the schema's options - a select reaches both paths as its index. */
const MODES: HalftoneColour[] = ['sampled', 'ink', 'cmyk', 'rgb'];

export interface HalftoneOptions extends FilterOptions {
	spacing?: number;
	angle?: number;
	scale?: number;
	colour?: HalftoneColour;
	background?: HalftoneGround;
}

/**
 * Redraws the frame as a grid of dots on a flat ground.
 *
 * The shape is `Pixelate`'s - find this pixel's cell, sample the source at the
 * cell's centre, decide what to write - and that is also why it is not a
 * variant of it: `Pixelate` fills every cell edge to edge, so it never shows a
 * ground and can never look drawn. Here the cell is mostly ground, and the dot
 * growing inside it is what carries the tone.
 *
 * One `colour` option covers four effects that look nothing alike, because it
 * selects the *colour model* rather than a tint:
 *
 * - `sampled` takes each dot's colour from its cell - a dot painting.
 * - `ink` fixes it to the opposite of the ground - newsprint.
 * - `cmyk` runs **four screens at four angles** and mixes them subtractively,
 *   which is what print actually does. Ben-Day dots, so it is also what a comic
 *   book is. The angles sit 30 degrees apart so the overlap makes a rosette
 *   rather than a moire, and yellow sits closest because it is least visible;
 *   at the default angle they come out as the classic C 15, M 75, Y 0, K 45.
 * - `rgb` puts **three dots in every cell** and adds them on black, which is
 *   what a screen is.
 *
 * `cmyk` and `rgb` ignore `background`: subtractive ink needs white paper and
 * additive light needs a black one, so there the colour model decides the
 * ground rather than the option.
 *
 * **CMYK lives or dies on the black.** `K = min(C, M, Y)` is pulled out before
 * anything prints, so a dark area lays down one black dot instead of stacking
 * three full-coverage coloured ones. Without it every black comes back muddy
 * brown with no contrast, and the honest conclusion would be that the mode does
 * not work - when it is one line.
 *
 * **RGB is dimmer than the picture it came from**, and that is inherent rather
 * than a bug: its three dots share a cell, so each can only light a third of it,
 * and a screen viewed close enough to see its subpixels *is* mostly gaps. It
 * wants roughly double the `scale` the other modes do.
 *
 * Three details are the difference between "looks like a halftone" and "looks
 * like a bug", and all three are cheap:
 *
 * **The grid is rotated.** An axis-aligned screen reads as a grid artifact laid
 * over a photograph, because its rows line up with everything else rectangular
 * in the frame. The classic screens sit near 15, 45 and 75 degrees precisely so
 * the eye reads tone instead of pattern.
 *
 * **The radius goes as the square root of coverage.** Perceived tone follows the
 * dot's *area*, and area goes as r^2, so a radius linear in coverage would make
 * every midtone far too light. This is the whole of correct tonal reproduction
 * in a halftone and it is one `sqrt`.
 *
 * **The dot edge is antialiased over one pixel.** A hard cut leaves small dots
 * as aliased crosses and makes the tone ramp visibly steppy. It also turns what
 * would be a hard 0-or-255 decision into a soft one, which is why this agrees
 * with its shader far more closely than the other cell-based filters do.
 */
export class Halftone extends Filter {
	static override shader = /* glsl */ `
uniform float u_spacing;
uniform float u_angle;
uniform float u_scale;
uniform float u_colour;
uniform float u_background;

/**
 * How much ink one screen wants from a cell, 0-1.
 *
 * 0 is the single-screen case, measured as distance from the ground so that a
 * dark cell on paper and a bright one on black both ask for a big dot. 1-4 are
 * C, M, Y and K; 5-7 are R, G and B.
 */
float coverageOf(vec3 rgb, int ink, float ground){
	if(ink == 0){
		return abs(luma(vec4(rgb, 255.0)) - ground) / 255.0;
	}
	if(ink <= 4){
		//CMYK with full grey-component replacement, and the K is not optional:
		//without pulling it out, every dark area stacks three full-coverage dots
		//on top of each other and the blacks come back muddy brown with no
		//contrast at all. One line, and it is the whole difference between this
		//looking like print and looking like a mistake.
		vec3 cmy = 1.0 - rgb / 255.0;
		float k = min(cmy.r, min(cmy.g, cmy.b));
		if(ink == 1) return cmy.r - k;
		if(ink == 2) return cmy.g - k;
		if(ink == 3) return cmy.b - k;
		return k;
	}
	//additive: a channel is its own coverage
	if(ink == 5) return rgb.r / 255.0;
	if(ink == 6) return rgb.g / 255.0;
	return rgb.b / 255.0;
}

/**
 * The strongest dot covering this pixel from one screen, and the cell colour it
 * came from.
 *
 * sub shifts the dot within its cell and share is the fraction of the cell
 * it may fill. Both are 0 and 1 for a full screen; the rgb mode uses them to
 * put three dots in one cell without needing a second grid.
 */
float screenInk(float spacing, float c, float s, int ink, float ground, float sub, float share, out vec3 tone){
	//into the screen's own frame, where the cells are axis-aligned
	vec2 p = vec2(outPixel()) + 0.5;
	float u =  p.x*c + p.y*s;
	float v = -p.x*s + p.y*c;
	float baseU = floor(u/spacing);
	float baseV = floor(v/spacing);

	//The nine cells around this pixel rather than only the one it falls in.
	//A dot is not confined to its own cell - past a scale of 1 it grows over
	//the edge into its neighbours - and testing one cell clips it to a square
	//exactly when it gets big enough to matter, so the dark end of the range
	//turns into a grid of squares instead of dots merging.
	float best = 0.0;
	tone = vec3(0.0);

	for(int oy = -1; oy <= 1; oy++){
		for(int ox = -1; ox <= 1; ox++){
			float cu = (baseU + float(ox) + 0.5) * spacing;
			float cv = (baseV + float(oy) + 0.5) * spacing;

			//the cell centre back in image space, which is where the colour comes
			//from - and it stays the centre whatever sub does to the dot, since
			//three sub-dots of one cell are all reading the same pixel
			vec4 here = srcTexel(ivec2(floor(vec2(cu*c - cv*s, cu*s + cv*c))));

			//distance is rotation-invariant, so measuring it here measures it in
			//the image too - no need to come back before taking the length
			float d = length(vec2(u - (cu + sub*spacing), v - cv));

			//area goes as r^2 and tone follows area, so the radius is the root
			float coverage = coverageOf(here.rgb, ink, ground);
			float radius = u_scale * spacing * share * 0.5 * sqrt(coverage);

			//antialiased over one pixel. The second factor fades out a dot
			//smaller than half a pixel, which the first cannot do on its own: at
			//radius 0 it still reports half coverage for the pixel exactly on the
			//centre, and a blown-out sky would come out stippled.
			float amount = clamp(radius - d + 0.5, 0.0, 1.0) * clamp(radius * 2.0, 0.0, 1.0);

			//the strongest dot covering this pixel wins it, rather than the inks
			//adding - two overlapping dots are opaque, not translucent
			if(amount > best){
				best = amount;
				tone = here.rgb;
			}
		}
	}
	return best;
}

void main(){
	float spacing = max(2.0, floor(u_spacing));
	float ground = u_background < 0.5 ? 255.0 : 0.0;
	int mode = int(u_colour + 0.5);
	vec3 tone;

	if(mode <= 1){
		float a = radians(u_angle);
		float ink = screenInk(spacing, cos(a), sin(a), 0, ground, 0.0, 1.0, tone);
		writeRGB(mix(vec3(ground), mode == 0 ? tone : vec3(255.0 - ground), ink));
		return;
	}

	if(mode == 2){
		//Four screens, 30 degrees apart, which is what turns their overlap into a
		//rosette instead of a moire; yellow sits 15 from its nearest neighbour
		//because it is the least visible of the four. At the default angle these
		//come out as exactly the classic set - C 15, M 75, Y 0, K 45.
		float ac = radians(u_angle - 30.0);
		float am = radians(u_angle + 30.0);
		float ay = radians(u_angle - 45.0);
		float ak = radians(u_angle);

		float cyan    = screenInk(spacing, cos(ac), sin(ac), 1, ground, 0.0, 1.0, tone);
		float magenta = screenInk(spacing, cos(am), sin(am), 2, ground, 0.0, 1.0, tone);
		float yellow  = screenInk(spacing, cos(ay), sin(ay), 3, ground, 0.0, 1.0, tone);
		float black   = screenInk(spacing, cos(ak), sin(ak), 4, ground, 0.0, 1.0, tone);

		//Subtractive. Each ink absorbs its complement and black absorbs the lot,
		//so the inks multiply rather than adding - which is why two overlapping
		//dots read as a third colour instead of as a brighter one.
		//
		//The paper is white whatever background says. This is the one place the
		//colour model decides the ground rather than the option: there is no such
		//thing as subtractive ink on a black page.
		writeRGB(vec3(1.0 - cyan, 1.0 - magenta, 1.0 - yellow) * (1.0 - black) * 255.0);
		return;
	}

	//Three dots to a cell on black, added rather than absorbed - a screen rather
	//than a page. Each lights only its own channel and does it at full strength,
	//because the dot's *size* is already carrying the intensity.
	float a = radians(u_angle);
	float c = cos(a);
	float s = sin(a);
	float third = 1.0 / 3.0;

	float red   = screenInk(spacing, c, s, 5, ground, -third, third, tone);
	float green = screenInk(spacing, c, s, 6, ground,    0.0, third, tone);
	float blue  = screenInk(spacing, c, s, 7, ground,  third, third, tone);

	writeRGB(vec3(red, green, blue) * 255.0);
}
`;

	static override schema: FilterSchema = {
		spacing: {
			type: 'int',
			label: 'Spacing',
			min: 2,
			max: 64,
			step: 1,
			default: 8,
			description: 'Distance between dot centres, in pixels. This is the resolution of the screen, so smaller keeps more of the picture.'
		},
		angle: {
			type: 'float',
			label: 'Angle',
			min: 0,
			max: 90,
			step: 1,
			default: 45,
			description: 'Rotation of the dot grid. 45 is the classic screen angle; 0 lines the dots up with the frame, which reads as a grid laid over the picture rather than as tone.'
		},
		scale: {
			type: 'float',
			label: 'Dot size',
			min: 0,
			max: 2,
			step: 0.05,
			default: 1,
			description: 'How much of a cell a full-strength dot fills. At 1 the dots just touch, which prints about a fifth lighter than the source; 1.13 matches inked area to tone exactly, and past 1.41 the dots reach the corners so solid areas go solid. RGB wants roughly double, since its three dots share one cell.'
		},
		colour: {
			type: 'select',
			label: 'Colour model',
			default: 'sampled',
			description: 'How the dots carry colour. Sampled and ink use one screen; CMYK uses four at different angles and mixes them like print; RGB puts three dots in every cell and adds them like a screen.',
			//order matters: a select reaches the shader as its index, and appending
			//rather than inserting is what keeps older links meaning what they said
			options: [
				{ value: 'sampled', label: 'Sampled - from the picture' },
				{ value: 'ink', label: 'Ink - flat' },
				{ value: 'cmyk', label: 'CMYK - four inks on paper' },
				{ value: 'rgb', label: 'RGB - three dots per cell' }
			]
		},
		background: {
			type: 'select',
			label: 'Background',
			default: 'white',
			description: 'The ground the dots are drawn on. White gives paper, and the dark parts of the picture get the big dots; black swaps that over. Ignored by CMYK and RGB, which are paper and screen respectively and cannot be otherwise.',
			options: [
				{ value: 'white', label: 'White - paper' },
				{ value: 'black', label: 'Black' }
			]
		}
	};

	override properties: {
		spacing: number;
		angle: number;
		scale: number;
		colour: HalftoneColour;
		background: HalftoneGround;
	};

	constructor(options: HalftoneOptions = {}) {
		super(options);
		this.properties = {
			spacing: options.spacing || 8,
			//a deliberate 0 is a legitimate angle, and `|| 45` would lose it
			angle: options.angle === undefined ? 45 : options.angle,
			scale: options.scale === undefined ? 1 : options.scale,
			colour: options.colour ?? 'sampled',
			background: options.background ?? 'white'
		};
	}

	/** How much ink one screen wants from a cell. Twin of the shader's. */
	private coverageOf(frame: ImageData, at: number, ink: number, ground: number): number {
		if(ink === 0){
			//'grey' explicitly rather than the filter's channel: the dot's size is
			//a tone, and reading it off one channel would size the dots by how red
			//the picture is
			return Math.abs(this.getColourValue(frame, at, 'grey') - ground) / 255;
		}
		if(ink <= 4){
			//see the shader: the K is what stops every dark area stacking three
			//full dots and coming back muddy brown
			const cyan = 1 - frame.data[at] / 255;
			const magenta = 1 - frame.data[at+1] / 255;
			const yellow = 1 - frame.data[at+2] / 255;
			const black = Math.min(cyan, Math.min(magenta, yellow));
			if(ink === 1) return cyan - black;
			if(ink === 2) return magenta - black;
			if(ink === 3) return yellow - black;
			return black;
		}
		return frame.data[at + (ink - 5)] / 255;
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;

		const spacing = Math.max(2, Math.floor(this.properties.spacing));
		const scale = this.properties.scale;
		const mode = MODES.indexOf(this.properties.colour);
		const ground = this.properties.background === 'white' ? 255 : 0;
		const degrees = Math.PI / 180;
		const third = 1 / 3;

		//[ink index, cos, sin, sub, share] per screen, in the shader's order
		const screens: [number, number, number, number, number][] = [];
		const at = (offset: number) => [
			Math.cos((this.properties.angle + offset) * degrees),
			Math.sin((this.properties.angle + offset) * degrees)
		];

		if(mode <= 1){
			const [c, s] = at(0);
			screens.push([0, c, s, 0, 1]);
		} else if(mode === 2){
			//30 degrees apart so the overlap makes a rosette; see the shader
			const [cc, cs] = at(-30);
			const [mc, ms] = at(30);
			const [yc, ys] = at(-45);
			const [kc, ks] = at(0);
			screens.push([1, cc, cs, 0, 1], [2, mc, ms, 0, 1], [3, yc, ys, 0, 1], [4, kc, ks, 0, 1]);
		} else {
			const [c, s] = at(0);
			screens.push([5, c, s, -third, third], [6, c, s, 0, third], [7, c, s, third, third]);
		}

		//one entry per screen, reused across pixels: [ink, index of the cell it
		//came from]. Allocating per pixel would be a garbage collection per frame.
		const inks = new Float64Array(screens.length);
		const tones = new Int32Array(screens.length);

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const px = x + 0.5;
				const py = y + 0.5;

				for(let n = 0; n < screens.length; n++){
					const [ink, c, s, sub, share] = screens[n];

					//into this screen's own frame; see the shader for the pair
					const u =  px*c + py*s;
					const v = -px*s + py*c;
					const baseU = Math.floor(u/spacing);
					const baseV = Math.floor(v/spacing);

					//the nine cells around this pixel, not only the one it falls in -
					//see the shader for why
					let best = 0;
					let from = 0;

					for(let oy = -1; oy <= 1; oy++){
						for(let ox = -1; ox <= 1; ox++){
							const cu = (baseU + ox + 0.5) * spacing;
							const cv = (baseV + oy + 0.5) * spacing;

							//back to image space, clamped like srcTexel
							const sx = Math.min(width - 1, Math.max(0, Math.floor(cu*c - cv*s)));
							const sy = Math.min(height - 1, Math.max(0, Math.floor(cu*s + cv*c)));
							const here = (sy*width + sx)*4;

							const du = u - (cu + sub*spacing);
							const dv = v - cv;
							const d = Math.sqrt(du*du + dv*dv);

							const coverage = this.coverageOf(frame, here, ink, ground);
							const radius = scale * spacing * share * 0.5 * Math.sqrt(coverage);
							const amount = Math.min(1, Math.max(0, radius - d + 0.5))
								* Math.min(1, Math.max(0, radius * 2));

							if(amount > best){
								best = amount;
								from = here;
							}
						}
					}

					inks[n] = best;
					tones[n] = from;
				}

				const i = (y*width + x)*4;

				if(mode <= 1){
					const dot = tones[0];
					const inkTone = 255 - ground;
					for(let k = 0; k < 3; k++){
						const towards = mode === 0 ? frame.data[dot + k] : inkTone;
						output.data[i + k] = ground + (towards - ground)*inks[0];
					}
				} else if(mode === 2){
					//subtractive, and the paper is white whatever `background` says
					output.data[i  ] = (1 - inks[0]) * (1 - inks[3]) * 255;
					output.data[i+1] = (1 - inks[1]) * (1 - inks[3]) * 255;
					output.data[i+2] = (1 - inks[2]) * (1 - inks[3]) * 255;
				} else {
					//additive, on black
					output.data[i  ] = inks[0] * 255;
					output.data[i+1] = inks[1] * 255;
					output.data[i+2] = inks[2] * 255;
				}

				//the ground is paper - opaque, whatever the source's alpha was
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
