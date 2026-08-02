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
	static override shader = /* glsl */ `
uniform float u_dynamic;

void main(){
	//Only the static form. Dynamic mode reflects within the frame's own min and
	//max, which is a whole-image reduction rather than a per-pixel operation -
	//see supportsGPU below.
	writeRGB(vec3(255.0) - srcPixel(vUv).rgb);
}
`;

	static override supportsGPU(filter: any): boolean {
		return !filter.properties.dynamic;
	}

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
