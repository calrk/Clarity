//Blur object
//Currently uses StackBlur, maybe add more in future.

import { Filter } from '../../core/Filter.js';
import { createImageData } from '../../core/imagedata.js';
import { StackBlurProcess } from '../../vendor/StackBlur.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { StackBlurProcessInstance } from '../../vendor/StackBlur.js';

export interface BlurOptions extends FilterOptions {
	radius?: number;
}

export class Blur extends Filter {
	static override schema: FilterSchema = {
		radius: { type: 'int', label: 'Radius', min: 1, max: 180, step: 1, default: 10 }
	};

	override properties: {
		radius: number;
	};
	processor!: StackBlurProcessInstance;

	constructor(options: BlurOptions = {}) {
		super(options);
		this.processor = new (StackBlurProcess as unknown as new () => StackBlurProcessInstance)();

		this.properties = {
			radius: options.radius || 10
		};
	}

	override doProcess(frame: ImageData): ImageData {
		if(this.properties.radius < 1){
			return frame;
		}

		let output = createImageData(frame.width, frame.height);
		    output.data.set(frame.data);

		return this.processor.stackBlurCanvasRGB(output, this.properties.radius);
	}
}
