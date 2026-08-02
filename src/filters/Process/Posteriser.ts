//Posterise object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { medianCut, nearestColourIndex } from '../../helpers/quantise.js';
import { sampleFrame } from '../../helpers/sample.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { RGBTriplet } from '../../helpers/quantise.js';
import type { FilterData } from '../../gpu/GLBackend.js';

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
	vec3 c = srcPixel(vUv).rgb;

	//Median cut is split between the two: the palette is built on the CPU from
	//a small sample of the frame, uploaded as a 1D texture, and only the
	//nearest-colour lookup runs here. That is the right seam - the lookup is
	//O(pixels x palette) and the build is O(distinct colours).
	if(u_method < 0.5){
		//no palette means nothing opaque in the frame to quantise, which is the
		//empty frame the CPU returns
		if(uDataSize.x < 0.5){
			fragColor = vec4(0.0);
			return;
		}

		int best = 0;
		float bestDistance = -1.0;

		//median cut can return fewer entries than asked for, so the palette's own
		//width is the bound. The schema caps it at 20; a loop needs a constant.
		for(int i = 0; i < 20; i++){
			if(i >= int(uDataSize.x)){
				break;
			}
			vec3 entry = dataTexel(i, 0).rgb;
			vec3 delta = c - entry;
			float distance_ = dot(delta, delta);
			//strictly less, so ties go to the lower index exactly as
			//nearestColourIndex does
			if(bestDistance < 0.0 || distance_ < bestDistance){
				bestDistance = distance_;
				best = i;
			}
		}

		writeRGB(dataTexel(best, 0).rgb);
		return;
	}

	//The fast method snaps each channel to fixed evenly spaced bands.
	float step_ = floor(255.0 / u_colours + 0.5);
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

	/**
	 * Median cut needs the pixels in CPU memory, and on the GPU path they are in
	 * a texture. 48 keeps that readback to about 1% of a 1080p frame, and costs
	 * nothing in palette quality - median cut is a colour distribution algorithm
	 * and does not care about spatial detail.
	 */
	static override samples = 48;

	static override prepare(filter: any, sample: ImageData): void {
		if(filter.properties.method === 'median'){
			filter.palette = medianCut(sample.data, { colours: filter.properties.colours });
		}
	}

	/** The palette, as a row of texels the shader can look up. */
	static override data(filter: any): FilterData | null {
		const palette: RGBTriplet[] = filter.palette ?? [];
		if(filter.properties.method !== 'median' || palette.length === 0){
			return null;
		}

		const bytes = new Uint8Array(palette.length * 4);
		for(let i = 0; i < palette.length; i++){
			bytes[i*4]     = palette[i][0];
			bytes[i*4 + 1] = palette[i][1];
			bytes[i*4 + 2] = palette[i][2];
			bytes[i*4 + 3] = 255;
		}

		return { width: palette.length, height: 1, bytes };
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

		//The palette comes from a small point-sampled copy rather than the whole
		//frame - not to save time here, but because the GPU path cannot afford to
		//read a full frame back and the two must agree. It costs nothing in
		//quality: median cut is a colour distribution algorithm and does not care
		//about spatial detail. `prepare` is the shared entry point, so both
		//backends build the palette from exactly the same pixels.
		Posteriser.prepare(this, sampleFrame(frame, Posteriser.samples));
		const palette = this.palette ?? [];

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
