//Mirror
//Mirrors the image in x or y

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface MirrorOptions extends FilterOptions {
	Horizontal?: boolean;
	Vertical?: boolean;
}

export class Mirror extends Filter {
	override properties: {
		Horizontal: boolean;
		Vertical: boolean;
	};

	constructor(options: MirrorOptions = {}) {
		super(options);
		this.properties = {
			//`options.Horizontal || true` is always true - it could never be turned off
			Horizontal: options.Horizontal === undefined ? true : options.Horizontal,
			Vertical: options.Vertical || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//written as a gather (read from the mirrored source) rather than a scatter, so
		//every output pixel is guaranteed to be written. The old scatter used
		//width-x / height-y, which wrote index `width` on x=0 - wrapping onto the next
		//row - and never wrote column 0 at all.
		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let to = (y*frame.width + x)*4;
				let fromX = x;
				let fromY = y;
				if(this.properties.Horizontal){
					fromX = frame.width-1-x;
				}
				if(this.properties.Vertical){
					fromY = frame.height-1-y;
				}

				let from = ((fromY)*frame.width + fromX)*4;

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

		let toggle = Interface.createToggle('Vertical', this.properties.Vertical);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('Vertical');
		});

		toggle = Interface.createToggle('Horizontal', this.properties.Horizontal);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('Horizontal');
		});

		return controls;
	}
}
