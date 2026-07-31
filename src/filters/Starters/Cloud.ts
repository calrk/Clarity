//Cloud object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface CloudOptions extends FilterOptions {
	red?: number;
	green?: number;
	blue?: number;
	linear?: boolean;
	iterations?: number;
	initialSize?: number;
}

export class Cloud extends Filter {
	override properties: {
		red: number;
		green: number;
		blue: number;
		linear: boolean;
		iterations: number;
		initialSize: number;
	};

	constructor(options: CloudOptions = {}) {
		super(options);
		this.properties = {
			red: options.red || 0,
			green: options.green || 0,
			blue: options.blue || 0,
			linear: options.linear || false,
			iterations: options.iterations || 4,
			initialSize: options.initialSize || 4
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let size = this.properties.initialSize;
		let iterations = 0;

		let data = [];
		for(let i = 0; i < frame.height*frame.width*3; i++){
			data[i] = 0;
		}
		for(let z = 0; z < this.properties.iterations; z++){
			if(z > 0){
				size *= 2;	//octaves double; the old size *= (z+1) gave 4, 8, 24, 96
			}
			if(size > frame.width){
				break;
			}
			iterations ++;

			let values: number[][] = [];
			for(let i = 0; i < size; i++){
				values[i] = [];
				for(let j = 0; j < size; j++){
					values[i][j] = Math.round(this.random()*255);
				}
			}

			for(let y = 0; y < frame.height; y++){
				for(let x = 0; x < frame.width; x++){
					let i = (y*frame.width + x)*3;

					let xpercent = (x%(frame.width/size))/(frame.width/size);
					let ypercent = (y%(frame.height/size))/(frame.height/size);
					let x1 = Math.floor(x/frame.width*size);
					let x2 = Math.ceil(x/frame.width*size);
					if(x2 >= size){
						x2 = 0;
					}

					let y1 = Math.floor(y/frame.height*size);
					let y2 = Math.ceil(y/frame.height*size);
					if(y2 >= size){
						y2 = 0;
					}

					let xval1; //interpolate in x(top) first
					let xval2; //interpolate in x(bottom) second
					let yval2; //interpolate between x(top) and x(bottom) using y

					if(!this.properties.linear){
						xpercent = this.smoothStep(xpercent);
						ypercent = this.smoothStep(ypercent);
					}

					xval1 = this.linearInterpolate(values[y1][x1], values[y1][x2], xpercent);
					xval2 = this.linearInterpolate(values[y2][x1], values[y2][x2], xpercent);
					yval2 = this.linearInterpolate(xval1, xval2, ypercent);

					data[i  ] += yval2/(z+1);
					data[i+1] += yval2/(z+1);
					data[i+2] += yval2/(z+1);
				}
			}
		}

		let output = createImageData(frame.width, frame.height);
		if(iterations == 0){
			return output;	//initialSize was wider than the frame, nothing was accumulated
		}
		//data holds 3 entries per pixel, so this loops over pixels - not over data.length,
		//which ran 3x past the end of output
		for(let k = 0; k < frame.width*frame.height; k ++){
			let i = k * 3;
			let j = k * 4;
			output.data[j  ] = data[i  ]/iterations * this.properties.red/255;
			output.data[j+1] = data[i+1]/iterations * this.properties.green/255;
			output.data[j+2] = data[i+2]/iterations * this.properties.blue/255;
			output.data[j+3] = (this.properties.red + this.properties.green + this.properties.blue)/3;
		}
		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 255, 1, 'red', this.properties.red);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('red', controlValue(e));
		});

		slider = Interface.createSlider(0, 255, 1, 'green', this.properties.green);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('green', controlValue(e));
		});

		slider = Interface.createSlider(0, 255, 1, 'blue', this.properties.blue);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('blue', controlValue(e));
		});

		slider = Interface.createSlider(0, 10, 1, 'iterations', this.properties.iterations);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('iterations', controlValue(e));
		});

		slider = Interface.createSlider(0, 16, 1, 'Initial Size', this.properties.initialSize);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('initialSize', controlValue(e));
		});

		let toggle = Interface.createToggle('linear', this.properties.linear);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('linear');
		});

		return controls;
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
