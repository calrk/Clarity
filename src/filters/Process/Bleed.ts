//Bleed object

import { Filter } from '../../core/Filter.js';
import { CHANNEL_FIELD } from '../../core/schema.js';
import { createImageData } from '../../core/imagedata.js';
import { StackBlurProcess } from '../../vendor/StackBlur.js';
import type { FilterOptions } from '../../core/Filter.js';
import type { FilterSchema } from '../../core/schema.js';
import type { StackBlurProcessInstance } from '../../vendor/StackBlur.js';

export interface BleedOptions extends FilterOptions {
	radius?: number;
}

export class Bleed extends Filter {
	static override schema: FilterSchema = {
		radius: { type: 'int', label: 'Radius', min: 1, max: 180, step: 1, default: 10 },
		channel: CHANNEL_FIELD
	};

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

		//StackBlur bails out with a bare `return` below a radius of 1, so the
		//result is `undefined` rather than an unblurred frame. Everything
		//downstream then dies on `.data`. Declaring a minimum of 1 in the schema
		//stops a control reaching it, but the constructor is not the only way in.
		if(this.properties.radius < 1){
			return output;
		}

		return this.processor.stackBlurCanvasSingle(output, this.properties.radius);
	}
}
