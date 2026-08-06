//Halftone object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type HalftoneColour = 'sampled' | 'ink';
export type HalftoneGround = 'white' | 'black';

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
 * One `colour` option covers two effects that look nothing alike. Take the dot
 * colour from the cell and you get a dot painting - coloured dots on white,
 * sized by strength. Fix it to the ink and you get newsprint.
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

void main(){
	float spacing = max(2.0, floor(u_spacing));
	float a = radians(u_angle);
	float c = cos(a);
	float s = sin(a);

	float ground = u_background < 0.5 ? 255.0 : 0.0;

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
	vec3 tone = vec3(0.0);

	for(int oy = -1; oy <= 1; oy++){
		for(int ox = -1; ox <= 1; ox++){
			float cu = (baseU + float(ox) + 0.5) * spacing;
			float cv = (baseV + float(oy) + 0.5) * spacing;

			//distance is rotation-invariant, so measuring it here measures it in
			//the image too - no need to come back before taking the length
			float d = length(vec2(u - cu, v - cv));

			//the cell centre back in image space, which is where the colour comes from
			vec4 here = srcTexel(ivec2(floor(vec2(cu*c - cv*s, cu*s + cv*c))));

			//How much ink this cell wants. On paper the ink is dark, so a dark
			//cell wants a lot of it; on a black ground the roles swap and the
			//bright cells are the ones that get big dots.
			float coverage = abs(luma(here) - ground) / 255.0;

			//area goes as r^2 and tone follows area, so the radius is the root
			float radius = u_scale * spacing * 0.5 * sqrt(coverage);

			//antialiased over one pixel. The second factor fades out a dot
			//smaller than half a pixel, which the first cannot do on its own: at
			//radius 0 it still reports half coverage for the pixel exactly on the
			//centre, and a blown-out sky would come out stippled.
			float ink = clamp(radius - d + 0.5, 0.0, 1.0) * clamp(radius * 2.0, 0.0, 1.0);

			//the strongest dot covering this pixel wins it, rather than the inks
			//adding - two overlapping dots are opaque, not translucent
			if(ink > best){
				best = ink;
				tone = here.rgb;
			}
		}
	}

	vec3 dot_ = u_colour < 0.5 ? tone : vec3(255.0 - ground);
	writeRGB(mix(vec3(ground), dot_, best));
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
			description: 'How much of a cell a full-strength dot fills. At 1 the dots just touch; above about 1.4 they meet at the corners and solid areas go solid.'
		},
		colour: {
			type: 'select',
			label: 'Dot colour',
			default: 'sampled',
			description: 'Sampled takes each dot from the picture, for coloured dots on a flat ground. Ink fixes them to the opposite of the background, which is newsprint.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'sampled', label: 'Sampled - from the picture' },
				{ value: 'ink', label: 'Ink - flat' }
			]
		},
		background: {
			type: 'select',
			label: 'Background',
			default: 'white',
			description: 'The ground the dots are drawn on. White gives paper, and the dark parts of the picture get the big dots; black swaps that over.',
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

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const width = frame.width;
		const height = frame.height;

		const spacing = Math.max(2, Math.floor(this.properties.spacing));
		const a = this.properties.angle * Math.PI / 180;
		const c = Math.cos(a);
		const s = Math.sin(a);
		const scale = this.properties.scale;
		const sampled = this.properties.colour === 'sampled';
		const ground = this.properties.background === 'white' ? 255 : 0;
		const inkTone = 255 - ground;

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				const px = x + 0.5;
				const py = y + 0.5;

				//into the screen's own frame; see the shader for the pair of these
				const u =  px*c + py*s;
				const v = -px*s + py*c;
				const baseU = Math.floor(u/spacing);
				const baseV = Math.floor(v/spacing);

				//the nine cells around this pixel, not only the one it falls in -
				//see the shader for why
				let best = 0;
				let at = 0;

				for(let oy = -1; oy <= 1; oy++){
					for(let ox = -1; ox <= 1; ox++){
						const cu = (baseU + ox + 0.5) * spacing;
						const cv = (baseV + oy + 0.5) * spacing;

						const du = u - cu;
						const dv = v - cv;
						const d = Math.sqrt(du*du + dv*dv);

						//back to image space, clamped like srcTexel
						const sx = Math.min(width - 1, Math.max(0, Math.floor(cu*c - cv*s)));
						const sy = Math.min(height - 1, Math.max(0, Math.floor(cu*s + cv*c)));
						const from = (sy*width + sx)*4;

						//'grey' explicitly rather than the filter's channel: the
						//dot's size is a tone, and reading it off one channel would
						//size the dots by how red the picture is
						const l = this.getColourValue(frame, from, 'grey');
						const coverage = Math.abs(l - ground) / 255;

						const radius = scale * spacing * 0.5 * Math.sqrt(coverage);
						const ink = Math.min(1, Math.max(0, radius - d + 0.5))
							* Math.min(1, Math.max(0, radius * 2));

						if(ink > best){
							best = ink;
							at = from;
						}
					}
				}

				const dotR = sampled ? frame.data[at]   : inkTone;
				const dotG = sampled ? frame.data[at+1] : inkTone;
				const dotB = sampled ? frame.data[at+2] : inkTone;

				const i = (y*width + x)*4;
				output.data[i  ] = ground + (dotR - ground)*best;
				output.data[i+1] = ground + (dotG - ground)*best;
				output.data[i+2] = ground + (dotB - ground)*best;
				//the ground is paper - opaque, whatever the source's alpha was
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
