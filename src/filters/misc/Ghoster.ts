import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface GhosterOptions extends FilterOptions {
	length?: number;
}

export class Ghoster extends Filter {
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

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(1, 30, 1, 'length', this.properties.length);
		controls.appendChild(slider);
		slider.getElementsByTagName('input')[0].addEventListener('change', (e: Event) => {
			this.setInt('length', controlValue(e));
		});

		return controls;
	}
}
