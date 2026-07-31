//LIFX object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import { Interface } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface LIFXOptions extends FilterOptions {
	showField?: boolean;
}

export class LIFX extends Filter {
	override properties: {
		showField: boolean;
	};
	currentRGB!: any;

	constructor(options: LIFXOptions = {}) {
		super(options);
		this.properties = {
			showField: false
		};

		this.currentRGB = {
			r:0,
			g:0,
			b:0,
		}
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		let averageCount = 0;
		let averageU = 0;
		let averageV = 0;

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				let u = (x-2)/frame.width-0.5;
				let v = (y-2)/frame.height-0.5;

				if(this.properties.showField){
					let rgb = Operations.YUVtoRGB({y:0.5, u:u, v:-v});
					output.data[i  ] = rgb.r*255;
					output.data[i+1] = rgb.g*255;
					output.data[i+2] = rgb.b*255;
				}
				else if(frame.data[i] > 128){
					//its a hit
					averageU += u;
					averageV += v;
					averageCount++;
				}

				output.data[i+3] = 255;
			}
		}
		if(averageCount == 0 || this.properties.showField){
			return output;
		}

		averageU = Operations.clamp(averageU/averageCount*1.5, -0.5, 0.5);
		averageV = Operations.clamp(averageV/averageCount*1.5, -0.5, 0.5);
		let rgb = Operations.YUVtoRGB({y:0.5, u:averageU, v:-averageV});
		rgb.r *= 255;
		rgb.g *= 255;
		rgb.b *= 255;

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				if(frame.data[i] > 128){
					//its a hit
					output.data[i  ] = rgb.r;
					output.data[i+1] = rgb.g;
					output.data[i+2] = rgb.b;
				}
				else{
					output.data[i  ] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}
			}
		}
		let midU = Math.round((averageU+0.5)*frame.width);
		let midV = Math.round((averageV+0.5)*frame.height);

		let i = (midV*frame.width + midU)*4;

		output.data[i  ] = 255-rgb.r;
		output.data[i+1] = 255-rgb.g;
		output.data[i+2] = 255-rgb.b;

		this.currentRGB = rgb;

		return output;
	}

	getRGB() {
		return this.currentRGB;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let toggle = Interface.createToggle('showField', this.properties.showField);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('showField');
		});

		return controls;
	}
}
