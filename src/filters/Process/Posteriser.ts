//Posterise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Operations } from '../../helpers/Operations.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import { MCut } from '../../vendor/MCut.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { MCutInstance } from '../../vendor/MCut.js';

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
	palette: [number, number, number][] | undefined;
	method: 'fast' | undefined;
	threshes: number[] = [];
	difference = 0;
	MCut!: MCutInstance;

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
		else{
			this.MCut = new (MCut as unknown as new () => { MCut: MCutInstance })().MCut;
		}
	}

	override doProcess(frame: ImageData): ImageData {
		if(this.method == 'fast'){
			return this.oldMethod(frame);
		}
		let output = createImageData(frame.width, frame.height);

		let data = [];
		for(let i = 0; i < frame.data.length; i+=4){
			data.push([frame.data[i],frame.data[i+1],frame.data[i+2]]);
		}

		this.MCut.init(data);
		this.palette = this.MCut.get_fixed_size_palette(this.properties.colours);

		const palette = this.palette;
		let prevPixel: number[] | undefined;
		let prevColour: number[] | undefined;
		for(let i = 0; i < frame.data.length; i+=4){
			let pix = [frame.data[i],frame.data[i+1],frame.data[i+2]];
			let col: number[];

			//Flat regions repeat the same pixel value over and over, so an identical
			//pixel must quantise to an identical palette entry - skip the search.
			//The original tried to do this by proximity, but compared `tempDist`
			//before it had been assigned, so the branch was never taken. Matching on
			//equality instead keeps the result exact rather than approximate.
			if(prevColour && prevPixel && pix[0] == prevPixel[0] && pix[1] == prevPixel[1] && pix[2] == prevPixel[2]){
				col = prevColour;
			}
			else{
				col = palette[0];
				let dist = Operations.colourDistance(pix, col);
				for(let j = 1; j < palette.length; j++){
					let tempDist = Operations.colourDistance(pix, palette[j]);
					if(tempDist < dist){
						dist = tempDist;
						col = this.palette[j];
					}
				}
				prevPixel = pix;
				prevColour = col;
			}

			output.data[i]   = col[0];
			output.data[i+1] = col[1];
			output.data[i+2] = col[2];
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
