//Brickulate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface BrickulateOptions extends FilterOptions {
	horizontalSegs?: number;
	verticalSegs?: number;
	grooveSize?: number;
	offset?: boolean;
}

export class Brickulate extends Filter {
	override properties: {
		horizontalSegs: number;
		verticalSegs: number;
		grooveSize: number;
		offset: boolean;
	};

	constructor(options: BrickulateOptions = {}) {
		super(options);
		this.properties = {
			horizontalSegs: options.horizontalSegs || 4,
			verticalSegs: options.verticalSegs || 4,
			grooveSize: options.grooveSize || 5,
			offset: options.offset || false
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		let widthSegs = Math.round(frame.width/this.properties.horizontalSegs);
		let heightSegs = Math.round(frame.height/this.properties.verticalSegs);

		let grooveSize = this.properties.grooveSize;
		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let i = (y*frame.width + x)*4;

				let xasd = x%widthSegs;
				let yasd = y%heightSegs;
				if(this.properties.offset){
					if(y%(heightSegs*2) < heightSegs){
						xasd += widthSegs*0.5;
						if(xasd > widthSegs){
							xasd -= widthSegs;
						}
					}
				}
				if((xasd <= grooveSize || xasd >= widthSegs-grooveSize) && (yasd <= grooveSize || yasd >= heightSegs-grooveSize)){
					output.data[i  ] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
					output.data[i+1] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
					output.data[i+2] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				}
				else if(xasd <= grooveSize){
					output.data[i  ] = 255*(grooveSize-xasd)/grooveSize;
					output.data[i+1] = 255*(grooveSize-xasd)/grooveSize;
					output.data[i+2] = 255*(grooveSize-xasd)/grooveSize;
				}
				else if(xasd >= widthSegs-grooveSize){
					output.data[i  ] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
					output.data[i+1] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
					output.data[i+2] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				}
				else if(yasd <= grooveSize){
					output.data[i  ] = 255*(grooveSize-yasd)/grooveSize;
					output.data[i+1] = 255*(grooveSize-yasd)/grooveSize;
					output.data[i+2] = 255*(grooveSize-yasd)/grooveSize;
				}
				else if(yasd >= heightSegs-grooveSize){
					output.data[i  ] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
					output.data[i+1] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
					output.data[i+2] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				}
				else{
					output.data[i  ] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}

				output.data[i+3] = 255;
			}
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();



		return controls;
	}
}
