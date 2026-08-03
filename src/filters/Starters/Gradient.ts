//Gradient object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type GradientShape = 'linear' | 'radial';

export interface GradientOptions extends FilterOptions {
	shape?: GradientShape;
	angle?: number;
	start?: number;
	end?: number;
}

/**
 * A linear or radial ramp, in grey.
 *
 * Grey rather than two colours because the point of it is to be a *mask*: the
 * thing you hand `Mask` or `Blend` to make anything fade, which is the
 * compositing primitive the library was missing. A coloured ramp is this
 * multiplied by a `FillRGB`, which is one more stage and keeps this filter from
 * growing six more properties nobody sets.
 *
 * The linear ramp is normalised across the frame's extent *along the angle*,
 * not across its width, so every angle uses the full range from `start` to
 * `end` rather than running out early on the diagonal. The radial one is
 * normalised to the nearest edge, so the corners sit at `end` and a centred
 * spotlight behaves the way you would expect.
 */
export class Gradient extends Filter {
	static override shader = /* glsl */ `
uniform float u_shape;
uniform float u_angle;
uniform float u_start;
uniform float u_end;

void main(){
	ivec2 p = outPixel();
	vec2 size = uSize;
	float t;

	if(u_shape > 0.5){
		//radial, normalised to the nearest edge rather than the far corner, so
		//the ramp finishes at the edge midpoints and the corners clamp
		vec2 centre = size * 0.5;
		float radius = min(centre.x, centre.y);
		t = clamp(length(vec2(p) + 0.5 - centre) / radius, 0.0, 1.0);
	} else {
		float radians = u_angle * 0.017453292519943295;
		vec2 dir = vec2(cos(radians), sin(radians));

		//The projection of the frame's corners onto the direction spans
		//|w*cos| + |h*sin|; normalising by that is what makes a diagonal ramp
		//reach 'end' in the corner instead of part way along.
		float span = abs(size.x * dir.x) + abs(size.y * dir.y);
		float lowest = min(0.0, size.x * dir.x) + min(0.0, size.y * dir.y);
		float here = (float(p.x) + 0.5) * dir.x + (float(p.y) + 0.5) * dir.y;
		t = span <= 0.0 ? 0.0 : clamp((here - lowest) / span, 0.0, 1.0);
	}

	writeRGB(vec3(u_start + (u_end - u_start) * t));
}
`;

	static override schema: FilterSchema = {
		shape: {
			type: 'select',
			label: 'Shape',
			default: 'linear',
			description: 'A straight ramp, or one radiating from the centre.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'linear', label: 'Linear' },
				{ value: 'radial', label: 'Radial' }
			]
		},
		angle: {
			type: 'int',
			label: 'Angle',
			min: 0,
			max: 360,
			step: 1,
			default: 0,
			description: 'Direction of a linear ramp, in degrees. 0 runs left to right. Ignored when radial.'
		},
		start: { type: 'int', label: 'Start', min: 0, max: 255, step: 1, default: 0, description: 'Value at the beginning of the ramp, or at the centre when radial.' },
		end: { type: 'int', label: 'End', min: 0, max: 255, step: 1, default: 255, description: 'Value at the end of the ramp, or at the edge when radial.' }
	};

	override properties: {
		shape: GradientShape;
		angle: number;
		start: number;
		end: number;
	};

	constructor(options: GradientOptions = {}) {
		super(options);
		this.properties = {
			shape: options.shape ?? 'linear',
			angle: options.angle === undefined ? 0 : options.angle,
			start: options.start === undefined ? 0 : options.start,
			end: options.end === undefined ? 255 : options.end
		};
	}

	override doProcess(frame: ImageData): ImageData {
		const output = createImageData(frame.width, frame.height);
		const { shape, angle, start, end } = this.properties;
		const width = frame.width;
		const height = frame.height;

		const radians = angle * 0.017453292519943295;
		const dirX = Math.cos(radians);
		const dirY = Math.sin(radians);
		const span = Math.abs(width*dirX) + Math.abs(height*dirY);
		const lowest = Math.min(0, width*dirX) + Math.min(0, height*dirY);

		const centreX = width * 0.5;
		const centreY = height * 0.5;
		const radius = Math.min(centreX, centreY);

		for(let y = 0; y < height; y++){
			for(let x = 0; x < width; x++){
				//half-pixel offsets, so a pixel is sampled at its centre and the
				//two backends agree about where the ramp starts
				const px = x + 0.5;
				const py = y + 0.5;

				let t;
				if(shape === 'radial'){
					const dx = px - centreX;
					const dy = py - centreY;
					t = Math.min(1, Math.max(0, Math.sqrt(dx*dx + dy*dy) / radius));
				} else {
					const here = px*dirX + py*dirY;
					t = span <= 0 ? 0 : Math.min(1, Math.max(0, (here - lowest) / span));
				}

				const value = start + (end - start)*t;
				const i = (y*width + x)*4;
				output.data[i  ] = value;
				output.data[i+1] = value;
				output.data[i+2] = value;
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
