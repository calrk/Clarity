//NormalGenerator object
//Contains a bit of vector maths, which may be pulled out in future if other filters require it

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface NormalGeneratorOptions extends FilterOptions {
	intensity?: number;
}

export class NormalGenerator extends Filter {
	override properties: {
		intensity: number;
	};

	constructor(options: NormalGeneratorOptions = {}) {
		super(options);
		this.properties = {
			intensity: options.intensity || 0.5
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		for(let y = 1; y < frame.height-1; y++){
			for(let x = 1; x < frame.width-1; x++){
				let i = (y*frame.width + x)*4;
				let up    = ((y-1)*frame.width + x)*4;
				let down  = ((y+1)*frame.width + x)*4;
				let left  = (y*frame.width + (x-1))*4;
				let right = (y*frame.width + (x+1))*4;

				let veci =     {x:x, y:y,   z: this.properties.intensity*this.getColourValue(frame, i, 'grey')};
				let vecleft =  {x:x-1, y:y, z: this.properties.intensity*this.getColourValue(frame, left, 'grey')};
				let vecright = {x:x+1, y:y, z: this.properties.intensity*this.getColourValue(frame, right, 'grey')};
				let vecup =    {x:x, y:y-1, z: this.properties.intensity*this.getColourValue(frame, up, 'grey')};
				let vecdown =  {x:x, y:y+1, z: this.properties.intensity*this.getColourValue(frame, down, 'grey')};

				let res = this.generateNormal(veci, vecleft, vecright, vecup, vecdown)

				output.data[i] =   (1-(res.x/2+0.5))*255;
				output.data[i+1] = (res.y/2+0.5)*255;
				output.data[i+2] = -res.z*255;

				output.data[i+3] = 255;
			}
		}

		//correcting horizontal edges
		for(let y = 0; y < frame.height; y++){
			let x = 0;
			let i = (y*frame.width + x)*4;
			let j = (y*frame.width + x+1)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;

			x = frame.width-1;
			i = (y*frame.width + x)*4;
			j = (y*frame.width + x-1)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;
		}

		//correcting vertical edges
		for(let x = 0; x < frame.width; x++){
			let y = 0;
			let i = (y*frame.width + x)*4;
			let j = ((y+1)*frame.width + x+1)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;

			y = frame.height-1;
			i = (y*frame.width + x)*4;
			j = ((y-1)*frame.width + x)*4;

			output.data[i  ] = output.data[j  ];
			output.data[i+1] = output.data[j+1];
			output.data[i+2] = output.data[j+2];
			output.data[i+3] = 255;
		}

		return output;
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 3, 0.1, 'intensity', this.properties.intensity);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('intensity', controlValue(e));
		});

		return controls;
	}

	generateNormal(centreIn: any, leftIn: any, rightIn: any, upIn: any, downIn: any) {
		let vecs = [];
		if(leftIn && upIn){
			vecs.push(this.calcNormal(centreIn, upIn, leftIn));
		}
		if(leftIn && downIn){
			vecs.push(this.calcNormal(centreIn, leftIn,  downIn));
		}
		if(rightIn && downIn){
			vecs.push(this.calcNormal(centreIn, downIn,  rightIn));
		}
		if(rightIn && upIn){
			vecs.push(this.calcNormal(centreIn, rightIn, upIn));
		}

		    let avg = this.average(vecs);

		    return avg;
	}

	calcNormal(vcentre: any, v1: any, v2: any) {
		let res1 = this.vectorSub(vcentre, v1);
		let res2 = this.vectorSub(vcentre, v2);
		    let cross = this.crossProduct(res1, res2);
		    cross = this.normalise(cross);
		    return cross
	}

	vectorSub(v1: any, v2: any) {
		return {
			x: v1.x-v2.x, 
			y: v1.y-v2.y, 
			z: v1.z-v2.z
		};
	}

	vectorAdd(v1: any, v2: any) {
		return {
			x: v1.x+v2.x, 
			y: v1.y+v2.y, 
			z: v1.z+v2.z
		};
	}

	crossProduct(v1: any, v2: any) {
		return {
			x:   v1.y*v2.z - v1.z*v2.y,
			y: -(v1.x*v2.z - v1.z*v2.x),
			z:   v1.x*v2.y - v1.y*v2.x
		}
	}

	normalise(v: any) {
		let mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
		return{
			x: v.x/mag,
			y: v.y/mag,
			z: v.z/mag
		}
	}

	average(ins: any) {
		let res = ins[0];
		for(let i = 1; i < ins.length; i++){
			res = this.vectorAdd(res, ins[i]);
		}

		res = this.normalise(res);
		return {
			x: res.x,
			y: res.y,
			z: res.z
		}
	}
}
