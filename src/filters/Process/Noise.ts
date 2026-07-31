//Noise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface NoiseOptions extends FilterOptions {
	intensity?: number;
	monochromatic?: boolean;
}

export class Noise extends Filter {
	override properties: {
		intensity: number;
		monochromatic: boolean;
	};

	constructor(options: NoiseOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 1,
			monochromatic: options.monochromatic || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			if(this.properties.monochromatic){
				let random = Math.round(2*(Math.random()-0.5)*this.properties.intensity);
				// let col = Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
				// col[2] += Operations.clamp((Math.random()-0.5)*2, 0, 1);
				// col = Operations.HSVtoRGB([col[0], col[1], col[2]]);
				output.data[i  ] = frame.data[i  ] + random;
				output.data[i+1] = frame.data[i+1] + random;
				output.data[i+2] = frame.data[i+2] + random;
			}
			else{
				output.data[i  ] = frame.data[i  ] + 2*(Math.random()-0.5)*this.properties.intensity;
				output.data[i+1] = frame.data[i+1] + 2*(Math.random()-0.5)*this.properties.intensity;
				output.data[i+2] = frame.data[i+2] + 2*(Math.random()-0.5)*this.properties.intensity;
			}

			output.data[i+3] = 255;
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 100, 0.1, 'intensity', this.properties.intensity);
		controls.appendChild(slider);
		slider.getElementsByTagName('input')[0].addEventListener('change', (e: Event) => {
			this.setFloat('intensity', controlValue(e));
		});

		let toggle = Interface.createToggle('monochromatic', this.properties.monochromatic);
		controls.appendChild(toggle);
		toggle.getElementsByTagName('input')[0].addEventListener('change', () => {
			this.toggleBool('monochromatic');
		});

		return controls;
	}
}
