//Pixelate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface PixelateOptions extends FilterOptions {
	size?: number;
}

export class Pixelate extends Filter {
	static override shader = /* glsl */ `
uniform float u_size;

void main(){
	int block = max(1, int(u_size));
	int half_ = block / 2;
	ivec2 size = ivec2(uSize);
	ivec2 p = outPixel();

	ivec2 corner = (p / block) * block;
	ivec2 sample_ = min(corner + half_, size - 1);

	writeRGB(srcTexel(sample_).rgb);
}
`;

	static override schema: FilterSchema = {
		size: { type: 'int', label: 'Block size', min: 1, max: 256, step: 1, default: 64, description: 'Side of each block, in pixels. Every block takes the colour of its centre.' }
	};

	override properties: {
		size: number;
	};

	constructor(options: PixelateOptions = {}) {
		super(options);
		this.properties = {
			size: options.size || 64
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//The old version shrank `size` until it divided the frame height, which
		//says nothing about the width - so on a frame whose width isn't a
		//multiple of the block size the last column of blocks ran off the end of
		//each row. Both the sample point and the writes wrapped onto the
		//following row, pulling in pixels from the opposite edge of the image.
		//
		//Clamping to the frame instead means partial blocks at the right and
		//bottom edges are handled correctly, and the requested block size is
		//honoured rather than quietly reduced.
		const size = Math.max(1, Math.floor(this.properties.size));
		const half = Math.floor(size/2);

		for(let y = 0; y < frame.height; y += size){
			for(let x = 0; x < frame.width; x += size){
				//sample the block's centre, clamped inside the frame
				const sampleX = Math.min(x + half, frame.width - 1);
				const sampleY = Math.min(y + half, frame.height - 1);
				const pos = (sampleY*frame.width + sampleX)*4;

				const maxY = Math.min(y + size, frame.height);
				const maxX = Math.min(x + size, frame.width);

				for(let ypos = y; ypos < maxY; ypos++){
					for(let xpos = x; xpos < maxX; xpos++){
						const i = (ypos*frame.width + xpos)*4;
						output.data[i  ] = frame.data[pos  ];
						output.data[i+1] = frame.data[pos+1];
						output.data[i+2] = frame.data[pos+2];
						output.data[i+3] = 255;
					}
				}
			}
		}

		return output;
	}
}
