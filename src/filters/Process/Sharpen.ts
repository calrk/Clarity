//Sharpen object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface SharpenOptions extends FilterOptions {
	intensity?: number;
}

export class Sharpen extends Filter {
	override properties: {
		intensity: number;
	};
	kernel!: number[][];

	constructor(options: SharpenOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 1
		};

		this.makeKernel(this.properties.intensity);
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//the kernel loop skips a one pixel border, which would otherwise be left
		//fully transparent rather than black
		for(let a = 3; a < output.data.length; a += 4){
			output.data[a] = 255;
		}

		for(let y = 4; y < frame.height*4-4; y+=4){
			for(let x = 4; x < frame.width*4-4; x+=4){
				let sumr = 0;
				let sumg = 0;
				let sumb = 0;
				for(let ky = -1; ky <= 1; ky++){
					for(let kx = -1; kx <= 1; kx++){
						let pos = (y + ky*4)*frame.width + (x + kx*4);

						let valr = this.getColourValue(frame, pos, 'red');
						let valg = this.getColourValue(frame, pos, 'green');
						let valb = this.getColourValue(frame, pos, 'blue');

						sumr += this.kernel[ky+1][kx+1] * valr;
						sumg += this.kernel[ky+1][kx+1] * valg;
						sumb += this.kernel[ky+1][kx+1] * valb;
					}
				}
				output.data[y*frame.width + x]   = sumr;
				output.data[y*frame.width + x+1] = sumg;
				output.data[y*frame.width + x+2] = sumb;
				output.data[y*frame.width + x+3] = 255;
			}
		}

		return output;
	}

	makeKernel(intensity: number): void {
		this.kernel = [ [ -intensity, -intensity, -intensity],
					    [ -intensity,  8*intensity+1, -intensity],
					    [ -intensity, -intensity, -intensity]];
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 3, 0.1, 'Intensity', this.properties.intensity);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('intensity', controlValue(e));
			this.makeKernel(this.properties.intensity);
		});

		return controls;
	}
}
