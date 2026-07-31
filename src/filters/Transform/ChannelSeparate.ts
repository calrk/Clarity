//Channel Separate
//Translates the image by the percentages specified

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface ChannelSeparateOptions extends FilterOptions {
	xdistance?: number;
	ydistance?: number;
	fixed?: boolean;
}

export class ChannelSeparate extends Filter {
	static override schema: FilterSchema = {
		xdistance: { type: 'int', label: 'X distance', min: -100, max: 100, step: 1, default: 0 },
		ydistance: { type: 'int', label: 'Y distance', min: -100, max: 100, step: 1, default: 0 },
		fixed: { type: 'bool', label: 'Fixed', default: false, description: 'Pixels rather than a percentage of the frame.' }
	};

	override properties: {
		xdistance: number;
		ydistance: number;
		fixed: boolean;
	};

	constructor(options: ChannelSeparateOptions = {}) {
		super(options);
		this.properties = {
			xdistance: options.xdistance || 0,
			ydistance: options.ydistance || 0,
			fixed: options.fixed || false,
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		let xTranslate = this.properties.xdistance;
		let yTranslate = this.properties.ydistance;

		if(this.properties.fixed){
			for(let y = 0; y < frame.height; y++){
				for(let x = 0; x < frame.width; x++){
					let from = (y*frame.width + x)*4;
					let toR = ((y+yTranslate)*frame.width + (x+xTranslate))*4
					let toG = ((y-yTranslate)*frame.width + (x-xTranslate))*4

					output.data[from+3] = 255;

					if(toR < 0){
						output.data[toG+1]  = frame.data[from+1];
						output.data[from+2] = frame.data[from+2];
						continue;
					}
					else if(toG < 0){
						output.data[toR]    = frame.data[from];
						output.data[from+2] = frame.data[from+2];
					}

					output.data[toR]    = frame.data[from];
					output.data[toG+1]  = frame.data[from+1];
					output.data[from+2] = frame.data[from+2];
				}
			}
		}
		else{
			let yPercent, xPercent;
			for(let y = 0; y < frame.height; y++){
				yPercent = Math.round((1-Math.abs(y/frame.height-0.5)*2)*yTranslate);
				for(let x = 0; x < frame.width; x++){
					xPercent = Math.round((1-Math.abs(x/frame.width-0.5)*2)*xTranslate);
					let from = (y*frame.width + x)*4;
					let toR = ((y+yPercent)*frame.width + (x+xPercent))*4
					let toG = ((y-yPercent)*frame.width + (x-xPercent))*4

					output.data[from+3] = 255;

					if(toR < 0){
						output.data[toG+1]  = frame.data[from+1];
						output.data[from+2] = frame.data[from+2];
						continue;
					}
					else if(toG < 0){
						output.data[toR]    = frame.data[from];
						output.data[from+2] = frame.data[from+2];
					}

					output.data[toR]    = frame.data[from];
					output.data[toG+1]  = frame.data[from+1];
					output.data[from+2] = frame.data[from+2];
				}
			}

			//fix horizontal lines
			for(let y = 0; y < frame.height; y++){
				for(let x = 0; x < frame.width; x++){
					let i = (y*frame.width + x)*4;
					let up = ((y-1)*frame.width + x)*4;
					let down = ((y+1)*frame.width + x)*4;

					if(output.data[i] == 0){
						output.data[i] = (output.data[up] + output.data[down])/2;
					}
					if(output.data[i+1] == 0){
						output.data[i+1] = (output.data[up+1] + output.data[down+1])/2;
					}
				}
			}

			//fix vertical lines
			//`left`/`right` were never declared in this loop - under `var` they
			//leaked out of the horizontal loop above, so every pixel here read the
			//same two stale indices (the last ones that loop happened to compute)
			for(let y = 0; y < frame.height; y++){
				for(let x = 0; x < frame.width; x++){
					let i = (y*frame.width + x)*4;
					let left = (y*frame.width + (x-1))*4;
					let right = (y*frame.width + (x+1))*4;

					if(output.data[i] == 0){
						output.data[i] = (output.data[left] + output.data[right])/2;
					}
					if(output.data[i+1] == 0){
						output.data[i+1] = (output.data[left+1] + output.data[right+1])/2;
					}
				}
			}
		}

		return output;
	}
}
