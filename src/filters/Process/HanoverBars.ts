//Hanover Bars object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { YUV } from '../../helpers/Operations.js';

export type HanoverBarsMode = 'hanover' | 'scanlines';

export interface HanoverBarsOptions extends FilterOptions {
	mode?: HanoverBarsMode;
	/** Lines per bar. The pattern repeats every `2 * width`. */
	width?: number;
	/** Bars down the frame rather than across it. */
	vertical?: boolean;
}

/**
 * Two artefacts of the same shape: every third and fourth line of the frame is
 * treated differently from the first and second.
 *
 * `hanover` rotates the chroma pair 30 degrees on those lines, which is the
 * PAL delay-line artefact the filter is named after. `scanlines` darkens them
 * instead, which is the CRT look the description has always also claimed.
 *
 * This used to be a boolean called `offset`, defaulting to *off* - and with the
 * rotation switched off there was nothing left, because the rotation is the
 * entire effect. Every pixel came back exactly as it went in. The reason
 * nobody noticed is a second bug: `Operations.YUVtoRGB` had a sign error, so
 * the RGB -> YUV -> RGB round trip those lines went through was not the
 * identity and appeared to be doing something. Fixing that turned the default
 * mode into a provable no-op, which the contact sheet flagged immediately.
 */
export class HanoverBars extends Filter {
	static override shader = /* glsl */ `
uniform float u_mode;
uniform float u_width;
uniform float u_vertical;

void main(){
	vec4 c = srcPixel(vUv);

	int width = int(u_width);
	ivec2 p = outPixel();
	int along = u_vertical > 0.5 ? p.x : p.y;
	//every other band of 'width' lines is the affected one
	int band = along / width;

	if(band - (band / 2) * 2 == 0){
		writeRGB(c.rgb);
		return;
	}

	if(u_mode > 0.5){
		writeRGB(c.rgb * 0.5);
		return;
	}

	//the CPU normalises to 0-1 before converting and scales back afterwards
	vec3 yuv = rgb2yuv(c.rgb / 255.0);
	float cs = cos(3.14159265358979 / 6.0);
	float sn = sin(3.14159265358979 / 6.0);
	yuv = vec3(yuv.x, yuv.y * cs - yuv.z * sn, yuv.y * sn + yuv.z * cs);

	writeRGB(yuv2rgb(yuv) * 255.0);
}
`;

	static override schema: FilterSchema = {
		mode: {
			type: 'select',
			label: 'Mode',
			default: 'hanover',
			description: 'Hanover rotates the chroma of alternate line pairs; scan lines darkens them.',
			options: [
				{ value: 'hanover', label: 'Hanover bars' },
				{ value: 'scanlines', label: 'Scan lines' }
			]
		},
		width: { type: 'int', label: 'Bar width', min: 1, max: 32, step: 1, default: 2, description: 'Lines per bar. The pattern repeats every twice this.' },
		vertical: { type: 'bool', label: 'Vertical', default: false, description: 'Bars down the frame rather than across it.' }
	};

	override properties: {
		mode: HanoverBarsMode;
		width: number;
		vertical: boolean;
	};

	constructor(options: HanoverBarsOptions = {}) {
		super(options);
		this.properties = {
			mode: options.mode ?? 'hanover',
			//2 reproduces the original hardcoded pattern: lines 2 and 3 of every 4
			width: options.width || 2,
			vertical: options.vertical || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		const width = this.properties.width;
		const vertical = this.properties.vertical;

		for(let y = 0; y < frame.height; y++){
			//every other band of `width` lines is the affected one
			let rowUntouched = !vertical && Math.floor(y/width) % 2 === 0;

			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;
				let untouched = vertical ? Math.floor(x/width) % 2 === 0 : rowUntouched;

				if(untouched){
					output.data[i  ] = frame.data[i];
					output.data[i+1] = frame.data[i+1];
					output.data[i+2] = frame.data[i+2];
					output.data[i+3] = 255;
				}
				else if(this.properties.mode === 'scanlines'){
					output.data[i  ] = frame.data[i]*0.5;
					output.data[i+1] = frame.data[i+1]*0.5;
					output.data[i+2] = frame.data[i+2]*0.5;
					output.data[i+3] = 255;
				}
				else{
					//separate bindings - the original reassigned one `pix` variable
					//through RGB -> YUV -> RGB
					let yuv = this.calcPair(Operations.RGBtoYUV({
						r: frame.data[i]/255,
						g: frame.data[i+1]/255,
						b: frame.data[i+2]/255
					}));
					let rgb = Operations.YUVtoRGB(yuv);
					output.data[i  ] = rgb.r*255;
					output.data[i+1] = rgb.g*255;
					output.data[i+2] = rgb.b*255;
					output.data[i+3] = 255;
				}
			}
		}

		return output;
	}


	/** Rotates the chroma pair 30 degrees - the Hanover bar itself. */
	calcPair(A: YUV): YUV {
		let cs = Math.cos(Math.PI/6);
		let sn = Math.sin(Math.PI/6);

		return{
			y: A.y,
			u: A.u * cs - A.v * sn,
			v: A.u * sn + A.v * cs
		}
	}
}
