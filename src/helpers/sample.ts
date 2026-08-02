import { createImageData } from '../core/imagedata.js';

/**
 * A small point-sampled copy of a frame, for the filters that need to look at
 * the whole image before they can process a pixel.
 *
 * `Posteriser`'s median cut is the case: building its palette needs the pixels
 * in CPU memory, and on the GPU path they are in a texture. Reading a 1080p
 * frame back is the eight-megabyte stall the whole shader backend exists to
 * avoid - but median cut is a colour *distribution* algorithm and does not care
 * about spatial detail, so a thumbnail gives essentially the same palette for
 * about 1% of the transfer.
 *
 * Point sampling rather than averaging, deliberately: averaging invents colours
 * that are not in the image, and a palette is supposed to be made of colours
 * that are.
 *
 * The step is a whole number of pixels so the shader twin can compute the same
 * indices in integer arithmetic and land on exactly the same pixels.
 */
export function sampleStep(width: number, height: number, longest: number): number {
	return Math.max(1, Math.ceil(Math.max(width, height) / longest));
}

export function sampleSize(width: number, height: number, longest: number): { width: number; height: number; step: number } {
	const step = sampleStep(width, height, longest);
	return {
		width: Math.ceil(width / step),
		height: Math.ceil(height / step),
		step
	};
}

export function sampleFrame(frame: ImageData, longest: number): ImageData {
	const size = sampleSize(frame.width, frame.height, longest);
	const out = createImageData(size.width, size.height);

	for (let y = 0; y < size.height; y++) {
		const from = Math.min(y * size.step, frame.height - 1);
		for (let x = 0; x < size.width; x++) {
			const at = (from * frame.width + Math.min(x * size.step, frame.width - 1)) * 4;
			const to = (y * size.width + x) * 4;
			out.data[to] = frame.data[at];
			out.data[to + 1] = frame.data[at + 1];
			out.data[to + 2] = frame.data[at + 2];
			out.data[to + 3] = frame.data[at + 3];
		}
	}

	return out;
}
