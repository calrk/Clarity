//Posterise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import { medianCut, nearestColourIndex } from '../../helpers/quantise.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { RGBTriplet } from '../../helpers/quantise.js';

export interface PosteriserOptions extends FilterOptions {
	/** Number of colours to quantise to. Ignored when `method` is `'fast'`. */
	colours?: number;
	/** `'fast'` selects the old fixed-threshold method instead of median cut. */
	method?: 'fast';
}

export class Posteriser extends Filter {
	override properties: {
		colours: number;
	};
	/** The palette from the most recent `doProcess`, once median cut has run. */
	palette: RGBTriplet[] | undefined;
	method: 'fast' | undefined;
	threshes: number[] = [];
	difference = 0;

	constructor(options: PosteriserOptions = {}) {
		super(options);
		this.properties = { colours: options.colours ?? 5 };
		this.palette = undefined;

		this.method = options.method;
		if(this.method == 'fast'){
			this.threshes = [128, 256];
			this.difference = 32;
			this.setThresh(64);
		}
	}

	override doProcess(frame: ImageData): ImageData {
		if(this.method == 'fast'){
			return this.oldMethod(frame);
		}
		let output = createImageData(frame.width, frame.height);

		//medianCut histograms the frame itself. The old MCut needed an array of
		//[r,g,b] triplets built per pixel first - 2 million of them at 1080p.
		const palette = medianCut(frame.data, { colours: this.properties.colours });
		this.palette = palette;

		if(palette.length === 0){
			return output;	//nothing opaque in the frame to quantise
		}

		const pix = [0, 0, 0];
		let prevKey = -1;
		let prevColour: RGBTriplet = palette[0];

		for(let i = 0; i < frame.data.length; i+=4){
			pix[0] = frame.data[i];
			pix[1] = frame.data[i+1];
			pix[2] = frame.data[i+2];

			//Flat regions repeat the same pixel value over and over, so an identical
			//pixel must quantise to an identical palette entry - skip the search.
			//The original tried to do this by proximity, but compared `tempDist`
			//before it had been assigned, so the branch was never taken. Matching on
			//equality instead keeps the result exact rather than approximate.
			const key = (pix[0] << 16) | (pix[1] << 8) | pix[2];
			if(key !== prevKey){
				prevColour = palette[nearestColourIndex(pix, palette)];
				prevKey = key;
			}

			output.data[i]   = prevColour[0];
			output.data[i+1] = prevColour[1];
			output.data[i+2] = prevColour[2];
			output.data[i+3] = 255;
		}

		return output;
	}

	/** The palette from the most recent `doProcess`. */
	Pallette(): [number, number, number][] | undefined {
		return this.palette;
	}

	oldMethod(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		this.setThresh(Math.round(255/this.properties.colours));

		for(let i = 0; i < frame.data.length; i+=4){
			if(!((i+1)%4 == 0)){
				for(let j = 0; j < this.threshes.length; j++){
					if(frame.data[i] < this.threshes[j]){
						output.data[i] = this.threshes[j] - this.difference/2;
						break;
					}
				}
			}
			else{
				output.data[i] = 255;
			}
		}

		return output;
	}

	setThresh(newNo: number): void {
		this.threshes = [];
		this.difference = newNo;
		//`i` is read after the loop, which only worked because `var` hoisted it
		let index = 0;
		let i = this.difference;
		for(; i <= 256; i+= this.difference){
			this.threshes[index] = i;
			index ++;
		}
		this.threshes[index] = i;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(1, 20, 1, 'Colours', this.properties.colours);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('colours', controlValue(e));
		});

		return controls;
	}
}
