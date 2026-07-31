//NormalFlip object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface NormalFlipOptions extends FilterOptions {
	red?: boolean;
	green?: boolean;
	swap?: boolean;
}

export class NormalFlip extends Filter {
	override properties: {
		red: boolean;
		green: boolean;
		swap: boolean;
	};

	constructor(options: NormalFlipOptions = {}) {
		super(options);
		this.properties = {
			red: options.red || false,
			green: options.green || false,
			swap: options.swap || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			if(this.properties.red){
				output.data[i] = 255-frame.data[i];
			}
			else{
				output.data[i] = frame.data[i];
			}

			if(this.properties.green){
				output.data[i+1] = 255-frame.data[i+1];
			}
			else{
				output.data[i+1] = frame.data[i+1];
			}

			if(this.properties.swap){
				let temp = output.data[i];
				output.data[i] = output.data[i+1];
				output.data[i+1] = temp;
			}

			output.data[i+2] = frame.data[i+2];
			output.data[i+3] = 255;
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let toggle = Interface.createToggle('Red', this.properties.red);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('red');
		});

		toggle = Interface.createToggle('Green', this.properties.green);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('green');
		});

		toggle = Interface.createToggle('Swap', this.properties.swap);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('swap');
		});

		return controls;
	}
}
