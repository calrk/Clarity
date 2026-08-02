//Hanover Bars object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { YUV } from '../../helpers/Operations.js';

export interface HanoverBarsOptions extends FilterOptions {
	offset?: boolean;
}

export class HanoverBars extends Filter {
	static override shader = /* glsl */ `
uniform float u_offset;

void main(){
	vec4 c = srcPixel(vUv);
	int line = outPixel().y - (outPixel().y / 4) * 4;

	if(line == 0 || line == 1){
		writeRGB(c.rgb);
		return;
	}

	//the CPU normalises to 0-1 before converting and scales back afterwards
	vec3 yuv = rgb2yuv(c.rgb / 255.0);
	if(u_offset > 0.5){
		float cs = cos(3.14159265358979 / 6.0);
		float sn = sin(3.14159265358979 / 6.0);
		yuv = vec3(yuv.x, yuv.y * cs - yuv.z * sn, yuv.y * sn + yuv.z * cs);
	}
	writeRGB(yuv2rgb(yuv) * 255.0);
}
`;

	static override schema: FilterSchema = {
		offset: { type: 'bool', label: 'Offset', default: false }
	};

	override properties: {
		offset: boolean;
	};

	constructor(options: HanoverBarsOptions = {}) {
		super(options);
		this.properties = {
			offset: options.offset || false,
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let y = 0; y < frame.height; y++){
			let line = y%4;
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				if(line == 0 || line == 1){
					output.data[i  ] = frame.data[i];
					output.data[i+1] = frame.data[i+1];
					output.data[i+2] = frame.data[i+2];
					output.data[i+3] = 255;
				}
				else{
					//separate bindings - the original reassigned one `pix` variable
					//through RGB -> YUV -> RGB
					let yuv = Operations.RGBtoYUV({
						r: frame.data[i]/255,
						g: frame.data[i+1]/255,
						b: frame.data[i+2]/255
					});
					if(this.properties.offset){
						yuv = this.calcPair(yuv);
					}
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


	/** Rotates the chroma pair 30 degrees, for the offset variant. */
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
