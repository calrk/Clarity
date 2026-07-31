//Motion Detector object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface MotionDetectorOptions extends FilterOptions {
	frameCount?: number;
}

export class MotionDetector extends Filter {
	override properties: {
		frameCount: number;
	};
	frames!: ImageData[];
	index!: number;
	preindex!: any;

	constructor(options: MotionDetectorOptions = {}) {
		super(options);
		this.frames = [];
		this.index = 0;
		this.properties = {
			frameCount: options.frameCount || 1
		}
		this.preindex = this.properties.frameCount;
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);

		this.pushFrame(frame);

		//waits until the buffer is full before trying to do stuff
		if(this.frames.length < this.properties.frameCount+1){
			return output;
		}

		//does motion detecting
		for(let i = 0; i < frame.width*frame.height*4; i+=4){
			output.data[i+0] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
			output.data[i+1] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
			output.data[i+2] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
			output.data[i+3] = 255;
		}
		return output;
	}

	pushFrame(frame: ImageData) {
		//makes a new frame, then copies current frame data into it
		this.frames[this.index] = createImageData(frame.width, frame.height);
		for(let i = 0; i < frame.data.length; i++){
			this.frames[this.index].data[i] = frame.data[i];
		}
		//increments and bounds checks the index
		this.index ++;
		if(this.index > this.properties.frameCount){
			this.index = 0;
		}
		//increments and bounds the preindex
		this.preindex ++;
		if(this.preindex > this.properties.frameCount){
			this.preindex = 0;
		}
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(1, 24, 1, 'Frame Count', this.properties.frameCount);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('frameCount', controlValue(e));

			//has to match the constructor: preindex starts at frameCount, not
			//frameCount-1, or the first comparison comes out as a frame against itself
			this.index = 0;
			this.preindex = this.properties.frameCount;
			this.frames = [];
		});

		return controls;
	}
}
