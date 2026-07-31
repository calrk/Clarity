import { Operations } from './Operations.js';

export type PixelChannel =
	| 'grey'
	| 'red' | 'r'
	| 'green' | 'g'
	| 'blue' | 'b'
	| 'hue' | 'h'
	| 'saturation' | 's'
	| 'value' | 'v';

/**
 * A single pixel, holding both RGB (0-255) and HSV (h in degrees, s/v in 0-1)
 * representations and keeping them in step.
 */
export class Pixel {
	r = 0;
	g = 0;
	b = 0;

	h = 0;
	s = 0;
	v = 0;

	constructor(r: number, g: number, b: number) {
		this.setFromRGB(r, g, b);
	}

	getColourValue(channel: PixelChannel = 'grey'): number {
		switch (channel) {
			case 'red':
			case 'r':
				return this.r;
			case 'green':
			case 'g':
				return this.g;
			case 'blue':
			case 'b':
				return this.b;
			case 'hue':
			case 'h':
				return this.h;
			case 'saturation':
			case 's':
				return this.s;
			case 'value':
			case 'v':
				return this.v;
			case 'grey':
			default:
				return this.r * 0.2989 + this.g * 0.587 + this.b * 0.114;
		}
	}

	setFromRGB(r: number, g: number, b: number): void {
		this.r = r;
		this.g = g;
		this.b = b;

		const min = Operations.minimum([this.r, this.g, this.b]);
		const max = Operations.maximum([this.r, this.g, this.b]);

		this.v = max / 255;
		const delta = max - min;

		if (max === 0) {
			this.s = 0;
			this.h = -1;
			return;
		}

		this.s = delta / max;

		if (this.r === max) {
			this.h = (this.g - this.b) / delta;		// between yellow & magenta
		} else if (this.g === max) {
			this.h = 2 + (this.b - this.r) / delta;	// between cyan & yellow
		} else {
			this.h = 4 + (this.r - this.g) / delta;	// between magenta & cyan
		}

		this.h *= 60;								// degrees
		if (this.h < 0) {
			this.h += 360;
		}
	}

	/** @param h degrees. @param s 0-1. @param v 0-1. r/g/b are written back as 0-255. */
	setFromHSV(h: number, s: number, v: number): void {
		this.h = h;
		this.s = s;
		this.v = v;

		if (this.s === 0) {	// grey
			this.r = this.g = this.b = this.v * 255;
			return;
		}

		const i = Math.floor(this.h / 60);
		const f = this.h / 60 - i;		// fractional part of h/60
		const p = this.v * (1 - this.s);
		const q = this.v * (1 - this.s * f);
		const t = this.v * (1 - this.s * (1 - f));

		switch (i) {
			case 0:
				this.r = v; this.g = t; this.b = p;
				break;
			case 1:
				this.r = q; this.g = v; this.b = p;
				break;
			case 2:
				this.r = p; this.g = v; this.b = t;
				break;
			case 3:
				this.r = p; this.g = q; this.b = v;
				break;
			case 4:
				this.r = t; this.g = p; this.b = v;
				break;
			default:
				this.r = v; this.g = p; this.b = q;
				break;
		}

		this.r *= 255;
		this.g *= 255;
		this.b *= 255;
	}

	toRGBArray(): [number, number, number] {
		return [this.r, this.g, this.b];
	}
}
