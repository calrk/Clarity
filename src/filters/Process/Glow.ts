//Glow object

import { Filter } from '../../core/Filter.js';
import { Blur } from './Blur.js';
import { Blend } from '../DualInput/Blend.js';
import { Interface, controlValue } from '../../helpers/Interface.js';
import { StackBlurProcess } from '../../vendor/StackBlur.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { StackBlurProcessInstance } from '../../vendor/StackBlur.js';

export interface GlowOptions extends FilterOptions {
	radius?: number;
}

export class Glow extends Filter {
	override properties: {
		radius: number;
	};
	processor!: StackBlurProcessInstance;

	constructor(options: GlowOptions = {}) {
		super(options);
		this.processor = new (StackBlurProcess as unknown as new () => StackBlurProcessInstance)();

		this.properties = {
			radius: options.radius || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		let blur = new Blur({radius: this.properties.radius}).process(frame);
		let blend = new Blend({ratio: 0.5}).process([frame, blur]);

		return blend;
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
