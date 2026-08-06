//Histogram object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { sampleFrame } from '../../helpers/sample.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { FilterData } from '../../gpu/GLBackend.js';

export type HistogramMode = 'rgb' | 'luma';

export interface HistogramOptions extends FilterOptions {
	mode?: HistogramMode;
	bins?: number;
	height?: number;
	overlay?: boolean;
	opacity?: number;
	log?: boolean;
}

/**
 * Draws the frame's tonal distribution across the bottom of it.
 *
 * The only filter in the library that *measures* the picture rather than
 * changing it, which makes it the one whose output is meant to be read rather
 * than looked at: where the tones actually sit, whether the highlights are
 * clipped, whether a channel is crushed.
 *
 * **The counting happens in `prepare` on both backends**, which is the shape
 * `samples` exists for and the reason this is not two implementations that
 * agree approximately. A shader fragment cannot count how many pixels are
 * darker than it - that is a reduction over the whole frame, and the ping-pong
 * pair has nowhere to put one - so the executor hands the same thumbnail to the
 * same `prepare` on both paths, and the bars reach the shader through `data()`
 * as one texel per bin. The GPU is then only *drawing* a graph somebody else
 * counted, which is a pure gather and is what a fragment shader is for.
 *
 * Three channels go into one texel's R, G and B, so the data texture is `bins`
 * wide and one tall whichever mode is running. That is why there is no row
 * indexing here and why `luma` costs the same as `rgb`.
 *
 * **The heights are normalised to the tallest bin and stored as bytes**, which
 * has a consequence worth knowing rather than discovering: the graph shows the
 * *shape* of the distribution, never the count. Two frames whose histograms look
 * identical can have had wildly different pixel counts in them. That is what
 * every histogram in every photo editor does, and it is the reason a
 * photographer reads the shape and ignores the height.
 *
 * The failure that comes with it was measured rather than guessed at, because
 * the fix is a property and it wanted justifying. One bin holding a growing
 * share of the frame does nothing at all until it holds a lot: at 50% and 70%
 * of a test frame, every other occupied bin still renders; at 90%, 61 of the 63
 * survivors round to zero and the graph becomes a single spike over an empty
 * floor. It is a cliff rather than a slope, so `log` is off by default and is
 * there for the frames past it - a logo on flat black, a night shot. It costs
 * nothing to offer, because every scale decision here happens in `prepare` and
 * the shader only ever draws bars somebody else measured.
 *
 * In `rgb` the three curves share one scale rather than each being normalised
 * to its own, so a channel that really is crushed reads as crushed instead of
 * being stretched back up to look like the other two.
 */
export class Histogram extends Filter {
	/**
	 * Bigger than `Posteriser`'s 48 on purpose. A palette is a handful of
	 * clusters and a thumbnail settles it; a histogram divides its pixels into
	 * up to 256 buckets, and 48 gives about nine pixels a bucket - a graph made
	 * mostly of sampling noise. 256 gives a few hundred, and the counting is
	 * linear rather than the median cut's sequential clustering, so the extra
	 * pixels cost almost nothing.
	 */
	static override samples = 256;

	static override prepare(filter: any, sample: ImageData): void {
		const bins = filter.properties.bins;
		const luma = filter.properties.mode === 'luma';
		//three series always, so the shape below does not branch - luma fills
		//all three with the same numbers and the shader reads whichever it wants
		const counts = [new Float64Array(bins), new Float64Array(bins), new Float64Array(bins)];

		const index = (value: number) => Math.min(bins - 1, Math.floor((value / 256) * bins));

		for(let i = 0; i < sample.data.length; i += 4){
			if(luma){
				counts[0][index(filter.getColourValue(sample, i, 'grey'))]++;
			} else {
				counts[0][index(sample.data[i])]++;
				counts[1][index(sample.data[i + 1])]++;
				counts[2][index(sample.data[i + 2])]++;
			}
		}

		//One scale across all three, so a crushed channel reads as crushed
		let tallest = 0;
		for(const series of counts){
			for(const count of series){
				if(count > tallest) tallest = count;
			}
		}

		//Both scales send an empty bin to 0 and the tallest to 255; they differ
		//only in what happens between, so nothing downstream has to know which
		//ran. log1p rather than log because a bin holding one pixel has to stay
		//distinguishable from one holding none.
		const ceiling = filter.properties.log ? Math.log1p(tallest) : tallest;
		const scale = (count: number) => (filter.properties.log ? Math.log1p(count) : count) / ceiling;

		const bars = new Uint8Array(bins * 4);
		for(let bin = 0; bin < bins; bin++){
			for(let series = 0; series < 3; series++){
				//rounded, not floored, so a bin that is nearly the tallest does not
				//lose a whole step of the 255 the byte has to carry
				const height = ceiling > 0 ? Math.round(scale(counts[luma ? 0 : series][bin]) * 255) : 0;
				bars[bin*4 + series] = height;
			}
			bars[bin*4 + 3] = 255;
		}

		filter.bars = bars;
	}

	/** One texel a bin: R, G and B are the three curves' heights, 0-255. */
	static override data(filter: any): FilterData | null {
		if(!filter.bars){
			return null;
		}
		return { width: filter.properties.bins, height: 1, bytes: filter.bars };
	}

	static override shader = /* glsl */ `
uniform float u_mode;
uniform float u_bins;
uniform float u_height;
uniform float u_overlay;
uniform float u_opacity;

void main(){
	ivec2 p = outPixel();
	vec4 here = srcPixel(vUv);
	vec3 base = u_overlay > 0.5 ? here.rgb : vec3(0.0);

	//uOutSize.y counts downward in image space, the same as the CPU's y, so the
	//graph's first row is the plain fraction rather than one minus it
	float span = uOutSize.y * u_height;
	float into = (float(p.y) + 0.5) - (uOutSize.y - span);

	if(into < 0.0 || span <= 0.0){
		writePixel(vec4(base, here.a));
		return;
	}

	//255 at the bottom row and 0 at the top of the graph, so a bar of height h
	//is exactly the rows whose level it reaches
	float level = (1.0 - into / span) * 255.0;

	int bin = clamp(int(float(p.x) / uOutSize.x * u_bins), 0, int(u_bins) - 1);
	vec3 bars = dataTexel(bin, 0).rgb;

	vec3 ink = u_mode > 0.5
		? vec3(bars.r >= level ? 255.0 : 0.0)
		: vec3(
			bars.r >= level ? 255.0 : 0.0,
			bars.g >= level ? 255.0 : 0.0,
			bars.b >= level ? 255.0 : 0.0
		);

	//only where something is drawn, so the empty part of the graph is not a
	//translucent black box over the picture
	float on = max(ink.r, max(ink.g, ink.b)) / 255.0;
	writePixel(vec4(mix(base, ink, on * u_opacity), here.a));
}
`;

	static override schema: FilterSchema = {
		mode: {
			type: 'select',
			label: 'Mode',
			default: 'rgb',
			description: 'Three curves for the colour channels, drawn over each other so the overlaps add, or one for brightness.',
			//order matters: a select reaches the shader as its index
			options: [
				{ value: 'rgb', label: 'RGB - three curves' },
				{ value: 'luma', label: 'Brightness - one curve' }
			]
		},
		bins: {
			type: 'int',
			label: 'Bins',
			min: 8,
			max: 256,
			step: 1,
			default: 64,
			description: 'How many buckets the tonal range is divided into. 256 is one per value and shows every gap and spike; fewer is smoother and easier to read at a glance.'
		},
		height: {
			type: 'float',
			label: 'Height',
			min: 0.05,
			max: 1,
			step: 0.05,
			default: 0.3,
			description: 'How much of the frame the graph stands in, from the bottom up. 1 fills it.'
		},
		overlay: {
			type: 'bool',
			label: 'Overlay',
			default: true,
			description: 'Draw over the picture. Switch it off for the graph on black, which is the readable version.'
		},
		opacity: {
			type: 'float',
			label: 'Opacity',
			min: 0,
			max: 1,
			step: 0.05,
			default: 0.75,
			description: 'How solid the bars are over the picture. Ignored where there is no bar, so the empty part of the graph never veils what is behind it.'
		},
		log: {
			type: 'bool',
			label: 'Log scale',
			default: false,
			description: 'Compress the tall bars so the short ones stay visible. Worth switching on when one tone dominates the frame - a logo on flat black, a night shot - and everything else has been flattened to nothing.'
		}
	};

	override properties: {
		mode: HistogramMode;
		bins: number;
		height: number;
		overlay: boolean;
		opacity: number;
		log: boolean;
	};

	/** Bar heights from the last `prepare`, one RGBA texel a bin. */
	bars: Uint8Array | null = null;

	constructor(options: HistogramOptions = {}) {
		super(options);
		this.properties = {
			mode: options.mode ?? 'rgb',
			bins: options.bins || 64,
			height: options.height ?? 0.3,
			overlay: options.overlay ?? true,
			opacity: options.opacity ?? 0.75,
			log: options.log || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		//`prepare` is the shared entry point, so both backends graph identical
		//pixels rather than the frame and a sample of it
		Histogram.prepare(this, sampleFrame(frame, Histogram.samples));

		const output = createImageData(frame.width, frame.height);
		const { mode, bins, height, overlay, opacity } = this.properties;
		const bars = this.bars!;

		const span = frame.height * height;
		const top = frame.height - span;

		for(let y = 0; y < frame.height; y++){
			const into = y + 0.5 - top;

			for(let x = 0; x < frame.width; x++){
				const at = (y*frame.width + x)*4;
				const baseRed   = overlay ? frame.data[at]   : 0;
				const baseGreen = overlay ? frame.data[at+1] : 0;
				const baseBlue  = overlay ? frame.data[at+2] : 0;

				if(into < 0 || span <= 0){
					output.data[at]   = baseRed;
					output.data[at+1] = baseGreen;
					output.data[at+2] = baseBlue;
					output.data[at+3] = frame.data[at+3];
					continue;
				}

				const level = (1 - into/span) * 255;
				const bin = Math.min(bins - 1, Math.max(0, Math.floor(x / frame.width * bins)));

				const red   = bars[bin*4]     >= level ? 255 : 0;
				const green = (mode === 'luma' ? bars[bin*4] : bars[bin*4 + 1]) >= level ? 255 : 0;
				const blue  = (mode === 'luma' ? bars[bin*4] : bars[bin*4 + 2]) >= level ? 255 : 0;

				const on = Math.max(red, green, blue) / 255 * opacity;

				output.data[at]   = baseRed   + (red   - baseRed)  *on;
				output.data[at+1] = baseGreen + (green - baseGreen)*on;
				output.data[at+2] = baseBlue  + (blue  - baseBlue) *on;
				output.data[at+3] = frame.data[at+3];
			}
		}

		return output;
	}
}
