//Rotator
//Rotates the image clockwise by the number of turns * 90 degrees

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export type RotatorFit = 'resize' | 'crop';

export interface RotatorOptions extends FilterOptions {
	turns?: number;
	/** What a quarter turn does to a non-square frame. See {@link Rotator}. */
	fit?: RotatorFit;
}

/**
 * Quarter turns clockwise.
 *
 * A quarter turn of a non-square frame has to give somewhere, and `fit` says
 * where. `resize` swaps the output dimensions - a 640x480 frame comes back
 * 480x640 - which is what rotation means and is the only lossless answer:
 * rotate, filter, rotate back and you have the frame you started with. `crop`
 * takes a centred square first and returns that, which is what this used to do,
 * approximately. On a square frame the two are identical.
 *
 * The old crop was wrong in a way worth recording: it applied its offset to
 * *both* axes, kept the original frame's dimensions, and left whatever it did
 * not write as transparent black. FEATURES.md #1 flagged it as approximate.
 */
export class Rotator extends Filter {
	static override shader = /* glsl */ `
uniform float u_turns;
uniform float u_fit;

void main(){
	int turns = int(u_turns);
	ivec2 inSize = ivec2(uSize);
	int side = min(inSize.x, inSize.y);

	//'crop' reads from a centred square of the input, so the region being
	//rotated is smaller than the frame and every fetch is offset by what was
	//trimmed. uOutSize is already the right shape either way - outputSize() told
	//the executor before it allocated the target.
	bool cropping = u_fit > 0.5 && inSize.x != inSize.y;
	ivec2 read = cropping ? (inSize - side) / 2 : ivec2(0);
	ivec2 region = cropping ? ivec2(side) : inSize;

	ivec2 p = outPixel();
	ivec2 from = p;

	if(turns == 1){
		from = ivec2(p.y, region.y - 1 - p.x);
	}
	else if(turns == 2){
		from = ivec2(region.x - 1 - p.x, region.y - 1 - p.y);
	}
	else if(turns == 3){
		from = ivec2(region.x - 1 - p.y, p.x);
	}

	writePixel(srcTexel(from + read));
}
`;

	static override schema: FilterSchema = {
		turns: { type: 'int', label: 'Turns', min: 0, max: 3, step: 1, default: 1, description: 'Quarter turns clockwise.' },
		fit: {
			type: 'select',
			label: 'Fit',
			default: 'resize',
			description: 'What a quarter turn does to a non-square frame.',
			options: [
				{ value: 'resize', label: 'Resize' },
				{ value: 'crop', label: 'Crop to square' }
			]
		}
	};

	static override outputSize(filter: any, width: number, height: number): { width: number; height: number } {
		if(width === height){
			return { width, height };
		}
		if(filter.properties.fit === 'crop'){
			const side = Math.min(width, height);
			return { width: side, height: side };
		}
		const quarter = filter.properties.turns === 1 || filter.properties.turns === 3;
		return quarter ? { width: height, height: width } : { width, height };
	}

	override properties: {
		turns: number;
		fit: RotatorFit;
	};

	constructor(options: RotatorOptions = {}) {
		super(options);
		this.properties = {
			turns: options.turns === undefined ? 1 : options.turns,
			fit: options.fit ?? 'resize'
		};

		while(this.properties.turns < 0){
			this.properties.turns += 4;
		}
		while(this.properties.turns >= 4){
			this.properties.turns -= 4;
		}
	}

	override doProcess(frame: ImageData): ImageData {
		const size = Rotator.outputSize(this, frame.width, frame.height);

		if(this.properties.turns == 0 && size.width == frame.width && size.height == frame.height){
			return frame;
		}

		//`crop` rotates a centred square of the input rather than the whole frame,
		//so the region being read is smaller and every read is offset by what was
		//trimmed off
		const cropping = this.properties.fit === 'crop' && frame.width !== frame.height;
		const side = Math.min(frame.width, frame.height);
		const readX = cropping ? Math.floor((frame.width - side)/2) : 0;
		const readY = cropping ? Math.floor((frame.height - side)/2) : 0;
		const sourceWidth = cropping ? side : frame.width;
		const sourceHeight = cropping ? side : frame.height;

		let output = createImageData(size.width, size.height);

		for(let y = 0; y < size.height; y++){
			for(let x = 0; x < size.width; x++){
				let fromX = 0;
				let fromY = 0;

				//gathers rather than scatters - each output pixel works out where its
				//colour came from, which has no gaps and is what a shader can run
				if(this.properties.turns == 0){
					fromX = x;
					fromY = y;
				}
				else if(this.properties.turns == 1){
					fromX = y;
					fromY = sourceHeight-1-x;
				}
				else if(this.properties.turns == 2){
					fromX = sourceWidth-1-x;
					fromY = sourceHeight-1-y;
				}
				else{
					fromX = sourceWidth-1-y;
					fromY = x;
				}

				let from = ((fromY + readY)*frame.width + (fromX + readX))*4;
				let to = (y*size.width + x)*4;

				output.data[to]   = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];
				output.data[to+3] = frame.data[from+3];
			}
		}

		return output;
	}
}
