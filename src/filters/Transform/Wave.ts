//Wave
//Translates the image by the percentages specified

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface WaveOptions extends FilterOptions {
	horizontal?: boolean;
	vertical?: boolean;
	speed?: number;
	frequency?: number;
	amplitude?: number;
}

export class Wave extends Filter {
	static override shader = /* glsl */ `
uniform float u_horizontal;
uniform float u_vertical;
uniform float u_speed;
uniform float u_frequency;
uniform float u_amplitude;

float waveFunction(float v){
	return sin(v) + sin(2.0 * v);
}

void main(){
	bool horizontal = u_horizontal > 0.5;
	bool vertical = u_vertical > 0.5;

	ivec2 size = ivec2(uSize);
	ivec2 p = outPixel();

	if(!horizontal && !vertical){
		writeRGB(srcTexel(p).rgb);
		return;
	}

	float phase = ((uTime / 1000.0) * 6.28318530717959) * u_speed;

	//vertical first, then horizontal reads from the displaced row - the same
	//order the CPU applies them in
	int fromY = p.y;
	if(vertical){
		fromY = p.y - int(floor(waveFunction(float(p.x) / u_frequency + phase) * u_amplitude));
	}
	fromY = ((fromY % size.y) + size.y) % size.y;

	int fromX = p.x;
	if(horizontal){
		fromX = p.x - int(floor(waveFunction(float(fromY) / u_frequency + phase) * u_amplitude));
	}
	fromX = ((fromX % size.x) + size.x) % size.x;

	writeRGB(texelFetch(uSrc, ivec2(fromX, fromY), 0).rgb * 255.0);
}
`;

	//Phase comes from the clock, so the output moves on its own.
	static override varying = true;

	static override schema: FilterSchema = {
		horizontal: { type: 'bool', label: 'Horizontal', default: false, description: 'Displace rows sideways.' },
		vertical: { type: 'bool', label: 'Vertical', default: false, description: 'Displace columns up and down. Both together give a swimming effect.' },
		speed: { type: 'int', label: 'Speed', min: -10, max: 10, step: 1, default: 1, description: 'Cycles per second. Negative runs the wave backwards, 0 freezes it.' },
		frequency: { type: 'float', label: 'Frequency', min: 1, max: 100, step: 1, default: 10, description: 'Divides the coordinate, so a higher number means longer, gentler waves.' },
		amplitude: { type: 'float', label: 'Amplitude', min: 1, max: 100, step: 1, default: 10, description: 'How far a pixel travels at the crest, in pixels.' }
	};

	override properties: {
		horizontal: boolean;
		vertical: boolean;
		speed: number;
		frequency: number;
		amplitude: number;
	};

	constructor(options: WaveOptions = {}) {
		super(options);
		this.properties = {
			horizontal: options.horizontal || false,
			vertical: options.vertical || false,
			speed: options.speed === undefined ? 1 : Math.round(options.speed),
			frequency: options.frequency || 10,
			amplitude: options.amplitude || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let horizontal = this.properties.horizontal;
		let vertical = this.properties.vertical;

		if(!horizontal && !vertical){
			return frame;
		}

		let output = createImageData(frame.width, frame.height);

		//this.now() climbs monotonically. The old Date().getMilliseconds()
		//wrapped at 1000ms, so the phase snapped back once every second.
		let phase = ((this.now()/1000)*Math.PI*2)*this.properties.speed;

		//hoisted out of the inner loop - each is a function of one axis only
		let xOffsets = [];
		if(horizontal){
			for(let y = 0; y < frame.height; y++){
				xOffsets[y] = Math.floor(this.waveFunction(y/this.properties.frequency+phase)*this.properties.amplitude);
			}
		}
		let yOffsets = [];
		if(vertical){
			for(let x = 0; x < frame.width; x++){
				yOffsets[x] = Math.floor(this.waveFunction(x/this.properties.frequency+phase)*this.properties.amplitude);
			}
		}

		for(let y = 0; y < frame.height; y++){
			for(let x = 0; x < frame.width; x++){
				let to = (y*frame.width + x)*4;

				//vertical first, then horizontal reads from the displaced row -
				//matches the order the old two-pass version applied them in
				let fromY = vertical ? y - yOffsets[x] : y;
				fromY = ((fromY % frame.height) + frame.height) % frame.height;

				let fromX = horizontal ? x - xOffsets[fromY] : x;
				fromX = ((fromX % frame.width) + frame.width) % frame.width;

				let from = (fromY*frame.width + fromX)*4;

				output.data[to  ] = frame.data[from  ];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];
				output.data[to+3] = 255;
			}
		}

		return output;
	}

	waveFunction(val: any) {
		return Math.sin(val) + Math.sin(2*val);
	}
}
