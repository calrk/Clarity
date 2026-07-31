//FillRGB object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface FillRGBOptions extends FilterOptions {
	red?: number;
	green?: number;
	blue?: number;
}

export class FillRGB extends Filter {
	override properties: {
		red: number;
		green: number;
		blue: number;
	};

	constructor(options: FillRGBOptions = {}) {
		super(options);
		this.properties = {
			red: options.red || 0,
			green: options.green || 0,
			blue: options.blue || 0
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		        // color: Math.floor(Math.random()*16777215).toString(16)

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			output.data[i  ] = this.properties.red;
			output.data[i+1] = this.properties.green;
			output.data[i+2] = this.properties.blue;
			output.data[i+3] = 255;
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 255, 1, 'red', this.properties.red);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('red', controlValue(e));
		});

		slider = Interface.createSlider(0, 255, 1, 'green', this.properties.green);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('green', controlValue(e));
		});

		slider = Interface.createSlider(0, 255, 1, 'blue', this.properties.blue);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('blue', controlValue(e));
		});

		return controls;
	}
}
