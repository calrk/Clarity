//Posterise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { medianCut, nearestColourIndex } from '../../helpers/quantise.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { RGBTriplet } from '../../helpers/quantise.js';

export type PosteriserMethod = 'median' | 'fast';

export interface PosteriserOptions extends FilterOptions {
	/** Number of colours to quantise to. Ignored when `method` is `'fast'`. */
	colours?: number;
	/** `'fast'` selects the old fixed-threshold method instead of median cut. */
	method?: PosteriserMethod;
}

export class Posteriser extends Filter {
	static override shader = /* glsl */ `
uniform float u_colours;
uniform float u_method;

void main(){
	//Only the fast method, which snaps each channel to fixed evenly spaced
	//bands. Median cut derives its palette from the whole image, which is a
	//sequential algorithm rather than a per-pixel one.
	float step_ = floor(255.0 / u_colours + 0.5);
	vec3 c = srcPixel(vUv).rgb;
	vec3 out_ = vec3(0.0);

	for(int channel = 0; channel < 3; channel++){
		float value = c[channel];
		//thresholds are step, 2*step, ... up to the first one past 256
		for(int n = 1; n <= 64; n++){
			float thresh = step_ * float(n);
			if(value < thresh){
				out_[channel] = thresh - step_ / 2.0;
				break;
			}
			if(thresh > 256.0) break;
		}
	}

	writeRGB(out_);
}
`;

	static override supportsGPU(filter: any): boolean {
		return filter.properties.method === 'fast';
	}

	static override schema: FilterSchema = {
		colours: { type: 'int', label: 'Colours', min: 1, max: 20, step: 1, default: 5, description: 'Palette size. Ignored by the fast method.' },
		method: { type: 'select', label: 'Method', default: 'median', description: 'Median cut derives a palette from the image; fast snaps to fixed bands.', options: [{ value: 'median', label: 'Median cut' }, { value: 'fast', label: 'Fast' }] }
	};

	override properties: {
		colours: number;
		method: PosteriserMethod;
	};
	/** The palette from the most recent `doProcess`, once median cut has run. */
	palette: RGBTriplet[] | undefined;
	threshes: number[] = [];
	difference = 0;

	constructor(options: PosteriserOptions = {}) {
		super(options);
		//`method` used to be a bare field set only in the constructor, so it was
		//not switchable at runtime and nothing could describe it. As a property
		//it gets a control for free and can be flipped live - `oldMethod` builds
		//its own thresholds, so nothing else has to be rebuilt.
		this.properties = {
			colours: options.colours ?? 5,
			method: options.method ?? 'median'
		};
		this.palette = undefined;
	}

	override doProcess(frame: ImageData): ImageData {
		if(this.properties.method === 'fast'){
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

	//The old, inaccurate-but-fast posterise: snap each channel to fixed evenly
	//spaced bands rather than deriving a palette from the image.
	oldMethod(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		this.setThresh(Math.round(255/this.properties.colours));

		//This used to step i by 4 while guarding with `(i+1) % 4 == 0`, a test
		//that only makes sense stepping one byte at a time. Stepping by 4 makes
		//it always false, so the alpha branch never ran and only the red channel
		//was ever written - green, blue and alpha stayed 0, and the whole output
		//was transparent.
		for(let i = 0; i < frame.data.length; i+=4){
			for(let c = 0; c < 3; c++){
				const value = frame.data[i+c];
				for(let j = 0; j < this.threshes.length; j++){
					if(value < this.threshes[j]){
						output.data[i+c] = this.threshes[j] - this.difference/2;
						break;
					}
				}
			}
			output.data[i+3] = 255;
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
}
