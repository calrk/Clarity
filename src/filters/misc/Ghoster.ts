import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { RetainedFrames } from '../../gpu/GLBackend.js';

export interface GhosterOptions extends FilterOptions {
	length?: number;
}

export class Ghoster extends Filter {
	//Onion-skins the last N frames, so it has to see every one of them.
	static override stateful = true;

	static override retains(filter: any): RetainedFrames {
		return { length: filter.properties.length };
	}

	static override shader = /* glsl */ `
uniform float u_length;

void main(){
	ivec2 p = outPixel();
	//how many frames the trail actually has, which is fewer than the full ring
	//until it has filled
	int count = min(uHistoryCount + 1, uHistoryLength);
	vec3 sum = vec3(0.0);

	//the schema caps the trail at 30, and a loop bound has to be a constant
	for(int j = 0; j < 30; j++){
		if(j >= count){
			break;
		}
		//age 0 is the newest, so it gets the heaviest weight.
		//weights sum to (count+1)/count, i.e. ~1.
		float weight = 2.0 * float(count - j) / float(count * count);
		sum += historyTexel(j, p).rgb * weight;
	}

	writeRGB(sum);
}
`;

	static override schema: FilterSchema = {
		length: { type: 'int', label: 'Trail length', min: 1, max: 30, step: 1, default: 10, description: 'How many frames are onion-skinned together.' }
	};

	override properties: {
		length: number;
	};
	frames!: ImageData[];

	constructor(options: GhosterOptions = {}) {
		super(options);
		this.properties = {
			length: options.length || 10
		};

		this.frames = new Array();
	}

	protected override dropState(): void {
		this.frames = [];
	}

	override doProcess(frame: ImageData): ImageData {
		//keeps its own copy so a later filter mutating the frame can't corrupt the trail
		let kept = createImageData(frame.width, frame.height);
		kept.data.set(frame.data);

		this.frames.unshift(kept);
		while(this.frames.length > this.properties.length){
			this.frames.pop();
		}

		let output = createImageData(frame.width, frame.height);
		let count = this.frames.length;

		for(let i = 0; i < frame.data.length; i+=4){
			let r = 0, g = 0, b = 0;
			for (let j = 0; j < count; j++) {
				//frames[0] is the newest, so it gets the heaviest weight.
				//weights sum to (count+1)/count, i.e. ~1.
				let weight = 2*(count-j)/(count*count);
				r += this.frames[j].data[i  ]*weight;
				g += this.frames[j].data[i+1]*weight;
				b += this.frames[j].data[i+2]*weight;
			};
			//accumulated in floats first - writing into the clamped array each
			//pass would round every partial sum
			output.data[i  ] = r;
			output.data[i+1] = g;
			output.data[i+2] = b;
			output.data[i+3] = 255;
		}

		return output;
	}
}
