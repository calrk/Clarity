//AddSub object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface AddSubOptions extends FilterOptions {
	subtractive?: boolean;
}

export class AddSub extends Filter {
	override properties: {
		subtractive: boolean;
	};

	constructor(options: AddSubOptions = {}) {
		super(options);
		this.properties = {
			subtractive: options.subtractive || false
		};
	}

	override doProcess(frame1: ImageData, frame2: ImageData): ImageData {
		let output = createImageData(frame1.width, frame1.height);

		for(let i = 0; i < frame1.width*frame1.height*4; i+=4){
			if(this.properties.subtractive){
				output.data[i  ] = frame1.data[i  ] - frame2.data[i  ];
				output.data[i+1] = frame1.data[i+1] - frame2.data[i+1];
				output.data[i+2] = frame1.data[i+2] - frame2.data[i+2];	
			}
			else{
				output.data[i  ] = frame1.data[i  ] + frame2.data[i  ];
				output.data[i+1] = frame1.data[i+1] + frame2.data[i+1];
				output.data[i+2] = frame1.data[i+2] + frame2.data[i+2];
			}
			output.data[i+3] = 255;
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let toggle = Interface.createToggle('subtractive', this.properties.subtractive);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('subtractive');
		});

		return controls;
	}
}
