//Translator
//Translates the image by the percentages specified

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface TranslatorOptions extends FilterOptions {
	horizontal?: number;
	vertical?: number;
}

export class Translator extends Filter {
	override properties: {
		horizontal: number;
		vertical: number;
	};

	constructor(options: TranslatorOptions = {}) {
		super(options);
		//`options.horizontal || 0.5` turned a deliberate 0 into 0.5, so "no shift" was unreachable
		this.properties = {
			horizontal: Operations.clamp(options.horizontal === undefined ? 0.5 : options.horizontal, -1, 1),
			vertical: Operations.clamp(options.vertical === undefined ? 0.5 : options.vertical, -1, 1)
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		let xTranslate = Math.ceil(frame.width * this.properties.horizontal);
		let yTranslate = Math.ceil(frame.height * this.properties.vertical);

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let from = (y*frame.width + x)*4;
				let toX = x + xTranslate;
				let toY = y + yTranslate;
				if(toX >= frame.width){
					toX -= frame.width;
				}
				else if(toX < 0){
					toX += frame.width;
				}
				if(toY >= frame.height){
					toY -= frame.height;
				}
				else if(toY < 0){
					toY += frame.height;
				}
				let to = ((toY)*frame.width + toX)*4;

				output.data[to] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];

				output.data[to+3] = 255;
			}
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 1, 0.01, 'Vertical', this.properties.vertical);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('vertical', controlValue(e));
		});

		slider = Interface.createSlider(0, 1, 0.01, 'Horizontal', this.properties.horizontal);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('horizontal', controlValue(e));
		});

		return controls;
	}
}
