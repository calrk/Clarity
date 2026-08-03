//Brickulate object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface BrickulateOptions extends FilterOptions {
	horizontalSegs?: number;
	verticalSegs?: number;
	grooveSize?: number;
	offset?: boolean;
}

export class Brickulate extends Filter {
	static override shader = /* glsl */ `
uniform float u_horizontalSegs;
uniform float u_verticalSegs;
uniform float u_grooveSize;
uniform float u_offset;

void main(){
	//Draws the grid over black - it never reads the source, which matches the
	//CPU implementation.
	float widthSegs = floor(uSize.x / u_horizontalSegs + 0.5);
	float heightSegs = floor(uSize.y / u_verticalSegs + 0.5);
	float groove = u_grooveSize;

	vec2 p = vec2(outPixel());
	float xa = mod(p.x, widthSegs);
	float ya = mod(p.y, heightSegs);

	if(u_offset > 0.5 && mod(p.y, heightSegs * 2.0) < heightSegs){
		xa += widthSegs * 0.5;
		if(xa > widthSegs) xa -= widthSegs;
	}

	float fromLeft   = 255.0 * (groove - xa) / groove;
	float fromRight  = 255.0 * (xa - widthSegs + groove) / groove;
	float fromTop    = 255.0 * (groove - ya) / groove;
	float fromBottom = 255.0 * (ya - heightSegs + groove) / groove;

	float value = 0.0;
	bool nearX = xa <= groove || xa >= widthSegs - groove;
	bool nearY = ya <= groove || ya >= heightSegs - groove;

	if(nearX && nearY){
		value = max(max(fromLeft, fromRight), max(fromTop, fromBottom));
	}
	else if(xa <= groove)                value = fromLeft;
	else if(xa >= widthSegs - groove)    value = fromRight;
	else if(ya <= groove)                value = fromTop;
	else if(ya >= heightSegs - groove)   value = fromBottom;

	writeRGB(vec3(value));
}
`;

	static override schema: FilterSchema = {
		horizontalSegs: { type: 'int', label: 'Columns', min: 1, max: 20, step: 1, default: 4, description: 'How many bricks across the frame.' },
		verticalSegs: { type: 'int', label: 'Rows', min: 1, max: 20, step: 1, default: 4, description: 'How many bricks down the frame.' },
		grooveSize: { type: 'int', label: 'Groove size', min: 1, max: 20, step: 1, default: 5, description: 'Width of the bevelled mortar line between bricks, in pixels.' },
		offset: { type: 'bool', label: 'Offset rows', default: false, description: 'Shift alternate rows by half a brick, for a running bond rather than a stacked grid.' }
	};

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
}
