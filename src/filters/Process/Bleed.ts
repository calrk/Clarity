//Bleed object

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import { StackBlurProcess } from '../../vendor/StackBlur.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { StackBlurProcessInstance } from '../../vendor/StackBlur.js';

export interface BleedOptions extends FilterOptions {
	radius?: number;
}

export class Bleed extends Filter {
	override properties: {
		radius: number;
	};
	processor!: StackBlurProcessInstance;

	constructor(options: BleedOptions = {}) {
		super(options);
		this.processor = new (StackBlurProcess as unknown as new () => StackBlurProcessInstance)();

		this.properties = {
			radius: options.radius || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let output = createImageData(frame.width, frame.height);
		output.data.set(frame.data);

		return this.processor.stackBlurCanvasSingle(output, this.properties.radius);
	}

	override doCreateControls(): HTMLElement {
		let controls = Interface.createDiv();

		let slider = Interface.createSlider(0, 180, 1, 'radius', this.properties.radius);
		controls.appendChild(slider);
		slider.addEventListener('change', (e: Event) => {
			this.setInt('radius', controlValue(e));
		});

		return controls;
	}
}
