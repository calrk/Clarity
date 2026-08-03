//Cloud object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { hashedByte, seedFrom } from '../../helpers/hash.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';

export interface CloudOptions extends FilterOptions {
	red?: number;
	green?: number;
	blue?: number;
	linear?: boolean;
	iterations?: number;
	initialSize?: number;
	/** Opaque output. Off derives alpha from the colour - see {@link Cloud}. */
	opaque?: boolean;
}

export class Cloud extends Filter {
	//Regenerates its noise field every call.
	static override varying = true;

	static override shader = /* glsl */ `
uniform float u_red;
uniform float u_green;
uniform float u_blue;
uniform float u_opaque;
uniform float u_linear;
uniform float u_iterations;
uniform float u_initialSize;

void main(){
	ivec2 p = outPixel();
	ivec2 frame = ivec2(uSize);
	int grid = int(u_initialSize);
	int used = 0;
	float total = 0.0;

	//the schema caps iterations at 10, and a loop bound has to be a constant
	for(int z = 0; z < 10; z++){
		if(z >= int(u_iterations)){
			break;
		}
		if(z > 0){
			grid *= 2;
		}
		if(grid > frame.x){
			break;
		}
		used++;

		//integer arithmetic for the cell and the position within it, so the two
		//backends land in the same cell rather than disagreeing at its edge
		int remX = (p.x * grid) % frame.x;
		int remY = (p.y * grid) % frame.y;
		int x1 = (p.x * grid - remX) / frame.x;
		int y1 = (p.y * grid - remY) / frame.y;
		int x2 = (x1 + 1) % grid;
		int y2 = (y1 + 1) % grid;

		float xp = float(remX) / float(frame.x);
		float yp = float(remY) / float(frame.y);
		if(u_linear < 0.5){
			xp = xp * xp * (3.0 - 2.0 * xp);
			yp = yp * yp * (3.0 - 2.0 * yp);
		}

		//the octave's grid of values, hashed rather than drawn in sequence
		float top = mix(hashedByte(x1, y1, z, uSeed), hashedByte(x2, y1, z, uSeed), xp);
		float bottom = mix(hashedByte(x1, y2, z, uSeed), hashedByte(x2, y2, z, uSeed), xp);

		total += mix(top, bottom, yp) / float(z + 1);
	}

	if(used == 0){
		fragColor = vec4(0.0);	//initialSize was wider than the frame
		return;
	}

	float value = total / float(used);
	writePixel(vec4(
		value * u_red / 255.0,
		value * u_green / 255.0,
		value * u_blue / 255.0,
		u_opaque > 0.5 ? 255.0 : (u_red + u_green + u_blue) / 3.0
	));
}
`;

	static override schema: FilterSchema = {
		//White by default. The colour scales the noise, so zero meant a black
		//frame - and with the old alpha rule, an invisible one.
		red: { type: 'int', label: 'Red', min: 0, max: 255, step: 1, default: 255, description: 'Scales the noise into the red channel. All three at 255 gives grey cloud.' },
		green: { type: 'int', label: 'Green', min: 0, max: 255, step: 1, default: 255, description: 'Scales the noise into the green channel.' },
		blue: { type: 'int', label: 'Blue', min: 0, max: 255, step: 1, default: 255, description: 'Scales the noise into the blue channel.' },
		opaque: { type: 'bool', label: 'Opaque', default: true, description: 'Off derives alpha from the colour, for use as a texture mask.' },
		linear: { type: 'bool', label: 'Linear', default: false, description: 'Interpolate straight between grid values instead of smoothing, which makes the cell edges visible.' },
		iterations: { type: 'int', label: 'Iterations', min: 1, max: 10, step: 1, default: 4, description: 'Octaves of value noise.' },
		initialSize: { type: 'int', label: 'Initial size', min: 1, max: 16, step: 1, default: 4, description: 'Grid size of the coarsest octave.' }
	};

	override properties: {
		red: number;
		green: number;
		blue: number;
		opaque: boolean;
		linear: boolean;
		iterations: number;
		initialSize: number;
	};

	constructor(options: CloudOptions = {}) {
		super(options);
		this.properties = {
			red: options.red === undefined ? 255 : options.red,
			green: options.green === undefined ? 255 : options.green,
			blue: options.blue === undefined ? 255 : options.blue,
			opaque: options.opaque !== false,
			linear: options.linear || false,
			iterations: options.iterations || 4,
			initialSize: options.initialSize || 4
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		//One draw per frame; every grid value is hashed from its own coordinates
		//after that. It used to draw size*size values per octave in row-major
		//order, which a shader cannot reproduce - fragments have no order to draw
		//in. See src/helpers/hash.ts.
		const seed = seedFrom(this.random);

		let size = this.properties.initialSize;
		let used = 0;
		let totals = new Float64Array(frame.width*frame.height);

		for(let z = 0; z < this.properties.iterations; z++){
			if(z > 0){
				size *= 2;	//octaves double; the old size *= (z+1) gave 4, 8, 24, 96
			}
			if(size > frame.width){
				break;
			}
			used ++;

			for(let y = 0; y < frame.height; y++){
				//Which cell this row falls in, and how far through it, in integer
				//arithmetic. The old form was `(y % (height/size)) / (height/size)`,
				//a modulo by a possibly fractional number, which only meant anything
				//when the grid divided the frame exactly.
				let remY = (y*size) % frame.height;
				let y1 = (y*size - remY) / frame.height;
				let y2 = (y1 + 1) % size;
				let ypercent = remY / frame.height;
				if(!this.properties.linear){
					ypercent = this.smoothStep(ypercent);
				}

				for(let x = 0; x < frame.width; x++){
					let remX = (x*size) % frame.width;
					let x1 = (x*size - remX) / frame.width;
					let x2 = (x1 + 1) % size;
					let xpercent = remX / frame.width;
					if(!this.properties.linear){
						xpercent = this.smoothStep(xpercent);
					}

					let top = this.linearInterpolate(
						hashedByte(x1, y1, z, seed), hashedByte(x2, y1, z, seed), xpercent);
					let bottom = this.linearInterpolate(
						hashedByte(x1, y2, z, seed), hashedByte(x2, y2, z, seed), xpercent);

					totals[y*frame.width + x] += this.linearInterpolate(top, bottom, ypercent)/(z+1);
				}
			}
		}

		if(used == 0){
			return output;	//initialSize was wider than the frame, nothing was accumulated
		}

		for(let k = 0; k < frame.width*frame.height; k ++){
			let j = k * 4;
			let value = totals[k]/used;
			output.data[j  ] = value * this.properties.red/255;
			output.data[j+1] = value * this.properties.green/255;
			output.data[j+2] = value * this.properties.blue/255;
			output.data[j+3] = this.properties.opaque
				? 255
				: (this.properties.red + this.properties.green + this.properties.blue)/3;
		}
		return output;
	}


	linearInterpolate(min: any, max: any, x: any) {
		return min+(max-min)*x;
	}

	smoothStep(x: any) {
		return x*x*(3 - 2*x);
	}

	smootherStep(x: any) {
		return x*x*x*(x*(x*6 - 15) + 10);
	}
}
