//Invert object

import { Filter } from '../../core/Filter.js';
import { CHANNEL_FIELD } from '../../core/schema.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface InvertOptions extends FilterOptions {
	dynamic?: boolean;
}

export class Invert extends Filter {
	static override shader = [
		{
			//Dynamic mode reflects within the frame's own range, so it needs the
			//minimum and maximum before it can touch a pixel. The reduction seed
			//maps each pixel to the value being compared; the pyramid in
			//`runReduction` collapses that to one texel this shader reads back.
			reduce: /* glsl */ `
void main(){
	float value = channelValue(srcPixel(vUv)) / 255.0;
	fragColor = vec4(value, value, 0.0, 1.0);
}
`,
			source: /* glsl */ `
uniform float u_dynamic;

void main(){
	vec3 c = srcPixel(vUv).rgb;

	if(u_dynamic > 0.5){
		//max + min - value reflects within the range; max - value would push
		//everything below min and clip, which is what the CPU used to do
		vec2 range = reduction();
		writeRGB(vec3(range.x + range.y) - c);
	}
	else{
		writeRGB(vec3(255.0) - c);
	}
}
`
		}
	];

	static override schema: FilterSchema = {
		dynamic: { type: 'bool', label: 'Dynamic', default: false, description: 'Reflects within the image own range rather than around 128.' },
		channel: CHANNEL_FIELD
	};

	override properties: {
		dynamic: boolean;
	};

	constructor(options: InvertOptions = {}) {
		super(options);
		this.properties = {
			dynamic: options.dynamic || false,
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		if(!this.properties.dynamic){
			for(let i = 0; i < frame.width*frame.height*4; i+=4){
				output.data[i  ] = 255-frame.data[i  ];
				output.data[i+1] = 255-frame.data[i+1];
				output.data[i+2] = 255-frame.data[i+2];
				output.data[i+3] = 255;
			}
		}
		else{
			let min = 255;
			let max = 0;

			for(let i = 0; i < frame.width*frame.height*4; i+=4){
				let colour = this.getColourValue(frame, i, this.channel);

				if(colour < min){
					min = colour;
				}
				if(colour > max){
					max = colour;
				}
			}

			//`max-min-value+min` cancels down to `max-value`, which pushes everything
			//below `min` and clips. Reflecting within the range is `max+min-value`.
			for(let i = 0; i < frame.width*frame.height*4; i+=4){
				output.data[i  ] = max+min-frame.data[i  ];
				output.data[i+1] = max+min-frame.data[i+1];
				output.data[i+2] = max+min-frame.data[i+2];
				output.data[i+3] = 255;
			}
		}

		return output;
	}
}
