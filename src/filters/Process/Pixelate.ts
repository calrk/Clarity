//Pixelate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface PixelateOptions extends FilterOptions {
	size?: number;
}

export class Pixelate extends Filter {
	override properties: {
		size: number;
	};

	constructor(options: PixelateOptions = {}) {
		super(options);
		this.properties = {
			size: options.size || 64
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		let size = this.properties.size;
		//makes sure the tile size is a multiple of the width/height
		while(frame.height%size != 0){
			size --;
		}
		let size2 = Math.round(size/2);
		for(let y = 0; y < frame.height; y += size){
			for(let x = 0; x < frame.width; x += size){

				let pos = ((y+size2)*frame.width + (x+size2))*4;
				for(let ypos = 0; ypos < size; ypos++){
					for(let xpos = 0; xpos < size; xpos++){
						let i = ((ypos+y)*frame.width + xpos+x)*4;
						output.data[i  ] = frame.data[pos  ];
						output.data[i+1] = frame.data[pos+1];
						output.data[i+2] = frame.data[pos+2];
						output.data[i+3] = 255;
					}
				}
			}
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 256, 1, 'size', this.properties.size);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('size', controlValue(e));
		});

		return controls;
	}
}
