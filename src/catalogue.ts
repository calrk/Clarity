/**
 * What each filter is, in one line, and which family it belongs to.
 *
 * Documentation metadata, in the same spirit as the per-property `description`
 * in a filter's schema: the library knows what its filters are for, so anything
 * building a palette, a docs page or a contact sheet can ask rather than keep
 * its own list. Three of those lists existed before this did, and they had
 * already drifted.
 *
 * Not UI. Clarity still ships no UI code - this is text, and what draws it is
 * somebody else's problem.
 */

export interface CatalogueEntry {
	category: CategoryName;
	/** One sentence. What it does, not how. */
	summary: string;
}

export type CategoryName =
	| 'Process'
	| 'Thresholders'
	| 'Salience'
	| 'Transform'
	| 'Height Map'
	| 'Starters'
	| 'Dual Input'
	| 'Misc';

/** Families, in the order a palette should show them: most-used first. */
export const CATEGORY_ORDER: CategoryName[] = [
	'Process',
	'Thresholders',
	'Salience',
	'Transform',
	'Height Map',
	'Starters',
	'Dual Input',
	'Misc'
];

export const CATALOGUE: Record<string, CatalogueEntry> = {
	// --- Process ---
	Bleed: { category: 'Process', summary: "Blurs a single channel, so colour bleeds out of its edges." },
	Blur: { category: 'Process', summary: "Stack blur - a fast Gaussian approximation." },
	Desaturate: { category: 'Process', summary: "Drops colour, keeping luminance." },
	DotRemover: { category: 'Process', summary: "Removes isolated pixels from a binary image - a clean-up pass for the output of an edge detector or thresholder." },
	Glow: { category: 'Process', summary: "Blurs the image and blends the blur back over the original." },
	HanoverBars: { category: 'Process', summary: "Rotates the chroma of every third and fourth line, or darkens them." },
	Invert: { category: 'Process', summary: "Inverts colour. In dynamic mode it reflects within the image's own range." },
	Noise: { category: 'Process', summary: "Adds random noise, optionally monochromatic." },
	Pixelate: { category: 'Process', summary: "Snaps the image to fixed-size blocks." },
	Posteriser: { category: 'Process', summary: "Quantises to a fixed number of colours via median cut." },
	Sharpen: { category: 'Process', summary: "Kernel sharpen, enhancing local contrast." },
	Smoother: { category: 'Process', summary: "Averages each pixel with its four neighbours, repeatedly." },
	hsvShifter: { category: 'Process', summary: "Rotates hue and scales saturation/value." },

	// --- Thresholders ---
	GradientThreshold: { category: 'Thresholders', summary: "Marks pixels whose neighbours differ by more than a threshold - edge detection by another route." },
	MedianThreshold: { category: 'Thresholders', summary: "Quantises using median and quartile pixel values." },
	ValueThreshold: { category: 'Thresholders', summary: "Two-tone threshold at a given value, or one derived from the image." },

	// --- Salience ---
	EdgeDetector: { category: 'Salience', summary: "Highlights edges with a 3x3 kernel, or a fast two-sample difference." },
	MotionDetector: { category: 'Salience', summary: "Absolute difference between the current frame and one N frames back." },
	SkinDetector: { category: 'Salience', summary: "Thresholds YCbCr into a binary skin/not-skin mask." },

	// --- Transform ---
	ChromaticAberration: { category: 'Transform', summary: "Displaces the R and G channels in opposite directions." },
	Mirror: { category: 'Transform', summary: "Flips the image horizontally, vertically, or both." },
	Rotator: { category: 'Transform', summary: "Rotates in 90 degree steps." },
	Tiler: { category: 'Transform', summary: "Mirrors the image into four quadrants, so opposite edges match and the result tiles seamlessly." },
	Translator: { category: 'Transform', summary: "Shifts the image by a percentage, wrapping at the edges." },
	Wave: { category: 'Transform', summary: "Displaces pixels along a sine function." },

	// --- Height Map ---
	Contourer: { category: 'Height Map', summary: "Bands a height map into discrete contour steps." },
	NormalFlip: { category: 'Height Map', summary: "Flips or swaps the X/Y axes of a normal map." },
	NormalGenerator: { category: 'Height Map', summary: "Derives a tangent-space normal map from a height map." },
	NormalIntensity: { category: 'Height Map', summary: "Strengthens or weakens the X/Y tilt of an existing normal map." },

	// --- Starters ---
	Cloud: { category: 'Starters', summary: "Fills the frame with tinted value-noise clouds." },
	FillHSV: { category: 'Starters', summary: "Fills the frame with one colour, specified in HSV." },
	FillRGB: { category: 'Starters', summary: "Fills the frame with one colour, specified in RGB." },

	// --- Dual Input ---
	Add: { category: 'Dual Input', summary: "Adds the second image to the first, clamping at white." },
	Subtract: { category: 'Dual Input', summary: "Subtracts the second image from the first, clamping at black." },
	Blend: { category: 'Dual Input', summary: "Weighted mix of two images." },
	Mask: { category: 'Dual Input', summary: "Binary stencil - keeps the first image where the mask is light, blacks it out where the mask is dark." },
	Multiply: { category: 'Dual Input', summary: "Multiplies the two images together, channel by channel." },

	// --- Misc ---
	Brickulate: { category: 'Misc', summary: "Overlays a brick/tile grid with bevelled grooves." },
	DifferenceDetector: { category: 'Misc', summary: "Compares each frame against the first one it saw." },
	Ghoster: { category: 'Misc', summary: "Onion-skins the last N frames together, weighted towards the newest." },
	Puzzler: { category: 'Misc', summary: "Scrambles the image into shuffled tiles." },
};
