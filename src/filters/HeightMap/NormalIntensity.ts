//NormalIntensity object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface NormalIntensityOptions extends FilterOptions {
	intensity?: number;
}

export class NormalIntensity extends Filter {
	override properties: {
		intensity: number;
	};

	constructor(options: NormalIntensityOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 0.5
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				let vector = {  x: (frame.data[i  ]-128)/128,
								y: (frame.data[i+1]-128)/128,
								z:  frame.data[i+2]/255
							 };

				vector = this.normalise(vector);
				vector.x *= this.properties.intensity;
				vector.y *= this.properties.intensity;
				vector = this.normalise(vector);

				output.data[i] =   (vector.x+1)*128;
				output.data[i+1] = (vector.y+1)*128;
				output.data[i+2] = vector.z*255;

				output.data[i+3] = 255;
			}
		}

		return output;
	}

	normalise(v: any) {
		let mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
		return{
			x: v.x/mag,
			y: v.y/mag,
			z: v.z/mag
		}
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 2, 0.1, 'intensity', this.properties.intensity);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('intensity', controlValue(e));
		});

		return controls;
	}
}
