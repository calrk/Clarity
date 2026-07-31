export interface YUV {
	y: number;
	u: number;
	v: number;
}

export interface RGB {
	r: number;
	g: number;
	b: number;
}

/** Assorted colour-space and numeric helpers shared by the filters. */
export const Operations = {
	/** @param input `[r, g, b]` in 0-255. @returns `[h (deg), s, v]` with s/v in 0-1. */
	RGBtoHSV(input: [number, number, number] | number[]): [number, number, number] {
		const r = input[0] / 255;
		const g = input[1] / 255;
		const b = input[2] / 255;

		const minRGB = Operations.minimum([r, g, b]);
		const maxRGB = Operations.maximum([r, g, b]);

		if (minRGB === maxRGB) {
			return [0, 0, minRGB];
		}

		// Colours other than black-grey-white:
		const d = r === minRGB ? g - b : b === minRGB ? r - g : b - r;
		const h = r === minRGB ? 3 : b === minRGB ? 1 : 5;

		return [
			60 * (h - d / (maxRGB - minRGB)),
			(maxRGB - minRGB) / maxRGB,
			maxRGB
		];
	},

	/** @param input `[h (deg), s, v]` with s/v in 0-1. @returns `[r, g, b]` in 0-255. */
	HSVtoRGB(input: [number, number, number] | number[]): [number, number, number] {
		const h = input[0];
		const s = input[1];
		const v = input[2];

		const sector = h / 60;
		const c = v * s;
		const x = c * (1 - Math.abs((sector % 2) - 1));
		const m = v - c;

		switch (Math.floor(sector)) {
			case 0:
			case 6:
				return [(c + m) * 255, (x + m) * 255, m * 255];
			case 1:
				return [(x + m) * 255, (c + m) * 255, m * 255];
			case 2:
				return [m * 255, (c + m) * 255, (x + m) * 255];
			case 3:
				return [m * 255, (x + m) * 255, (c + m) * 255];
			case 4:
				return [(x + m) * 255, m * 255, (c + m) * 255];
			default:
				return [(c + m) * 255, m * 255, (x + m) * 255];
		}
	},

	RGBtoYUV(rgb: RGB): YUV {
		return {
			y: 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
			u: -0.14713 * rgb.r - 0.28886 * rgb.g + 0.436 * rgb.b,
			v: 0.615 * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b
		};
	},

	YUVtoRGB(yuv: YUV): RGB {
		return {
			r: yuv.y + 1.13983 * yuv.v,
			g: yuv.y - -0.39465 * yuv.u + -0.5806 * yuv.v,
			b: yuv.y + 2.03211 * yuv.u
		};
	},

	minimum(ins: number[]): number {
		let out = Infinity;
		for (let i = 0; i < ins.length; i++) {
			if (ins[i] < out) {
				out = ins[i];
			}
		}
		return out;
	},

	maximum(ins: number[]): number {
		let out = -Infinity;
		for (let i = 0; i < ins.length; i++) {
			if (ins[i] > out) {
				out = ins[i];
			}
		}
		return out;
	},

	clamp(value: number, min: number, max: number): number {
		if (value < min) return min;
		if (value > max) return max;
		return value;
	},

	/** Squared euclidean distance in RGB. */
	colourDistance(from: number[], to: number[]): number {
		const dr = from[0] - to[0];
		const dg = from[1] - to[1];
		const db = from[2] - to[2];
		return dr * dr + dg * dg + db * db;
	},

	/** Spelling alias for {@link Operations.colourDistance}. */
	colorDistance(from: number[], to: number[]): number {
		return Operations.colourDistance(from, to);
	}
};
