//Wave
//Translates the image by the percentages specified

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import type { FilterOptions } from '../../core/Filter.js';

export interface WaveOptions extends FilterOptions {
	horizontal?: boolean;
	vertical?: boolean;
	speed?: number;
	frequency?: number;
	amplitude?: number;
}

export class Wave extends Filter {
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

		//performance.now() climbs monotonically. The old Date().getMilliseconds()
		//wrapped at 1000ms, so the phase snapped back once every second.
		let phase = ((performance.now()/1000)*Math.PI*2)*this.properties.speed;

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

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(-10, 10, 1, 'speed', this.properties.speed);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('speed', controlValue(e));
		});

		slider = Interface.createSlider(1, 100, 1, 'frequency', this.properties.frequency);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('frequency', controlValue(e));
		});

		slider = Interface.createSlider(1, 100, 1, 'amplitude', this.properties.amplitude);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setFloat('amplitude', controlValue(e));
		});

		let toggle = Interface.createToggle('Horizontal', this.properties.horizontal);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('horizontal');
		});

		toggle = Interface.createToggle('vertical', this.properties.vertical);
		controls.appendChild(toggle);
		toggle.addEventListener('change', () => {
			this.toggleBool('vertical');
		});

		return controls;
	}
}
