//Value Threshold object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface ValueThresholdOptions extends FilterOptions {
	inverted?: boolean;
	threshold?: number;
}

export class ValueThreshold extends Filter {
	override properties: {
		inverted: boolean;
		/** `null` means "work it out from the frame each time". */
		threshold: number | null;
	};

	constructor(options: ValueThresholdOptions = {}) {
		super(options);
		this.properties = {
			inverted: options.inverted || false,
			threshold: options.threshold || null		
		}
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//gets the threshold value
		let threshold = this.properties.threshold || this.getThresholdValue(frame);
		//performs the thresholding on the data
		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			let colour = this.getColourValue(frame, i, this.channel);
			if(this.properties.inverted){
				if(colour < threshold){
					output.data[i+0] = 255;
					output.data[i+1] = 255;
					output.data[i+2] = 255;
				}
				else{
					output.data[i+0] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}
			}
			else{
				if(colour > threshold){
					output.data[i+0] = 255;
					output.data[i+1] = 255;
					output.data[i+2] = 255;
				}
				else{
					output.data[i+0] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}
			}
			output.data[i+3] = 255;
		}

		return output;
	}

	getThresholdValue(data: any) {
		let average;
		average = this.getColourValue(data, 0);
		//finds the intial average of all the data
		for(let i = 4; i < data.width*data.height*4; i+=4){
			let colour = this.getColourValue(data, i);
			average = (average+colour)/2;
		}

		let lower = 0;
		let upper = 0;
		let previous = 0;
		let current = average;
		//checks to see if the new average is near the old average
		while(!(previous > current - 1 && previous < current + 1)){
			previous = current;
			//splits the data up depending on the current threshold, and finds an average of each
			for(let i = 0; i < data.width*data.height*4; i+=4){
				let colour = this.getColourValue(data, i);
				if(colour < previous){
					if(lower == 0){
						lower = colour;
					}
					else{
						lower = (lower + colour)/2;
					}
				}
				else{
					if(upper == 0){
						upper = colour;
					}
					else{
						upper = (upper + colour)/2;
					}
				}
			}
			//averages the two averages
			current = (upper+lower)/2;
			lower = 0;
			upper = 0;
		}
		return current;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let toggle = Interface.createToggle('Inverted', this.properties.inverted);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('inverted');
		});

		//null means auto, which the slider can't show - start it mid-range
		let slider = Interface.createSlider(0, 255, 1, 'Threshold', this.properties.threshold ?? 128);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('threshold', controlValue(e));
		});

		return controls;
	}
}
