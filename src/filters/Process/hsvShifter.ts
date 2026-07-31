//hsvShifter object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface hsvShifterOptions extends FilterOptions {
	hue?: number;
	saturation?: number;
	value?: number;
	/** Alias for {@link value}. */
	lightness?: number;
}

export class hsvShifter extends Filter {
	override properties: {
		hue: number;
		saturation: number;
		value: number;
	};

	constructor(options: hsvShifterOptions = {}) {
		super(options);
		this.properties = {
			hue: options.hue || 0,
			saturation: options.saturation || 1,
			value: options.value || options.lightness || 1
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let col = Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);

			col[0] += this.properties.hue;
			if(col[0] > 360){
				col[0] -= 360;
			}
			col[1] *= this.properties.saturation;
			col[2] *= this.properties.value;

			col = Operations.HSVtoRGB([col[0], col[1], col[2]]);

			output.data[i+0] = col[0];
			output.data[i+1] = col[1];
			output.data[i+2] = col[2];
			output.data[i+3] = frame.data[i+3];
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 360, 1, 'hue', this.properties.hue);
		controls.appendChild(slider);
		slider.getElementsByTagName('input')[0].addEventListener('change', (e: Event) => {
			this.setFloat('hue', controlValue(e));
		});

		slider = Interface.createSlider(0, 2, 0.1, 'saturation', this.properties.saturation);
		controls.appendChild(slider);
		slider.getElementsByTagName('input')[0].addEventListener('change', (e: Event) => {
			this.setFloat('saturation', controlValue(e));
		});

		slider = Interface.createSlider(0, 2, 0.1, 'lightness', this.properties.value);
		controls.appendChild(slider);
		slider.getElementsByTagName('input')[0].addEventListener('change', (e: Event) => {
			this.setFloat('value', controlValue(e));
		});

		return controls;
	}
}
