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

/**
 * The things about a filter that are not obvious from its name and that decide
 * whether it will do anything at all where you put it.
 *
 * A filter that wants a binary image produces mush on a photograph; one that
 * compares frames produces black on a still. Both are silent failures - the
 * pipeline runs, nothing errors, the output is just wrong - so the honest fix
 * is to say so up front rather than to leave it to be discovered.
 *
 * Split into what a filter *wants* and what it *makes*, because the pair is
 * what explains a chain: `DotRemover` wants binary, `ValueThreshold` makes it,
 * so the two go together in that order.
 */
export type FilterTrait =
	| 'starter'
	| 'dual'
	| 'temporal'
	| 'binary-in'
	| 'heightmap-in'
	| 'normalmap-in'
	| 'binary-out';

/** What to call each trait, once, so a chip and a docs table cannot disagree. */
export const TRAITS: Record<FilterTrait, { label: string; description: string }> = {
	starter: {
		label: 'Starter',
		description: 'Ignores its input and generates a frame, so it belongs at the head of a chain.'
	},
	dual: {
		label: 'Two inputs',
		description: 'Needs a second frame as well as the one flowing through the pipeline.'
	},
	temporal: {
		label: 'Needs motion',
		description: 'Compares frames over time. On a still image it has nothing to compare and outputs black.'
	},
	'binary-in': {
		label: 'Wants black & white',
		description: 'Expects an already-thresholded image. On a photograph the result is meaningless.'
	},
	'heightmap-in': {
		label: 'Wants a height map',
		description: 'Reads brightness as height, so it expects a greyscale height map rather than a picture.'
	},
	'normalmap-in': {
		label: 'Wants a normal map',
		description: 'Reads the channels as an XYZ vector, so it expects a normal map - run NormalGenerator first.'
	},
	'binary-out': {
		label: 'Makes black & white',
		description: 'Outputs two tones, which is what the filters wanting black and white are waiting for.'
	}
};

export interface CatalogueEntry {
	category: CategoryName;
	/** One sentence. What it does, not how. */
	summary: string;
	/** Absent means the ordinary case: takes a picture, returns a picture. */
	traits?: readonly FilterTrait[];
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
	Desaturate: { category: 'Process', summary: "Pulls colour towards grey, by an amount, keeping luminance." },
	DotRemover: { category: 'Process', summary: "Removes isolated pixels from a binary image - a clean-up pass for the output of an edge detector or thresholder.", traits: ['binary-in'] },
	Glow: { category: 'Process', summary: "Blurs the image and blends the blur back over the original." },
	HanoverBars: { category: 'Process', summary: "Rotates the chroma of every other bar of lines, or darkens them." },
	Invert: { category: 'Process', summary: "Inverts colour. In dynamic mode it reflects within the image's own range." },
	Noise: { category: 'Process', summary: "Adds random noise, optionally monochromatic." },
	Pixelate: { category: 'Process', summary: "Snaps the image to fixed-size blocks." },
	Posteriser: { category: 'Process', summary: "Quantises to a fixed number of colours via median cut." },
	Sharpen: { category: 'Process', summary: "Kernel sharpen, enhancing local contrast." },
	Smoother: { category: 'Process', summary: "Averages each pixel with its four neighbours, repeatedly." },
	hsvShifter: { category: 'Process', summary: "Rotates hue and scales saturation/value." },

	// --- Thresholders ---
	GradientThreshold: { category: 'Thresholders', summary: "Marks pixels whose neighbours differ by more than a threshold - edge detection by another route.", traits: ['binary-out'] },
	MedianThreshold: { category: 'Thresholders', summary: "Quantises using median and quartile pixel values." },
	ValueThreshold: { category: 'Thresholders', summary: "Two-tone threshold at a given value, or one derived from the image.", traits: ['binary-out'] },

	// --- Salience ---
	EdgeDetector: { category: 'Salience', summary: "Highlights edges with a 3x3 kernel, or a fast two-sample difference." },
	MotionDetector: { category: 'Salience', summary: "Absolute difference between the current frame and one N frames back.", traits: ['temporal'] },
	SkinDetector: { category: 'Salience', summary: "Thresholds YCbCr into a binary skin/not-skin mask.", traits: ['binary-out'] },

	// --- Transform ---
	ChromaticAberration: { category: 'Transform', summary: "Displaces the R and G channels in opposite directions." },
	Mirror: { category: 'Transform', summary: "Flips the image horizontally, vertically, or both." },
	Rotator: { category: 'Transform', summary: "Rotates in 90 degree steps." },
	Tiler: { category: 'Transform', summary: "Mirrors the image into four quadrants, so opposite edges match and the result tiles seamlessly." },
	Translator: { category: 'Transform', summary: "Shifts the image by a percentage, wrapping at the edges." },
	Wave: { category: 'Transform', summary: "Displaces pixels along a sine function." },

	// --- Height Map ---
	Contourer: { category: 'Height Map', summary: "Bands a height map into discrete contour steps.", traits: ['heightmap-in'] },
	NormalFlip: { category: 'Height Map', summary: "Flips or swaps the X/Y axes of a normal map.", traits: ['normalmap-in'] },
	NormalGenerator: { category: 'Height Map', summary: "Derives a tangent-space normal map from a height map.", traits: ['heightmap-in'] },
	NormalIntensity: { category: 'Height Map', summary: "Strengthens or weakens the X/Y tilt of an existing normal map.", traits: ['normalmap-in'] },

	// --- Starters ---
	Cloud: { category: 'Starters', summary: "Fills the frame with tinted value-noise clouds.", traits: ['starter'] },
	FillHSV: { category: 'Starters', summary: "Fills the frame with one colour, specified in HSV.", traits: ['starter'] },
	FillRGB: { category: 'Starters', summary: "Fills the frame with one colour, specified in RGB.", traits: ['starter'] },

	// --- Dual Input ---
	Add: { category: 'Dual Input', summary: "Adds the second image to the first, clamping at white.", traits: ['dual'] },
	Subtract: { category: 'Dual Input', summary: "Subtracts the second image from the first, clamping at black.", traits: ['dual'] },
	Difference: { category: 'Dual Input', summary: "Absolute difference between two images - symmetric, and it keeps the range Subtract clamps away.", traits: ['dual'] },
	Blend: { category: 'Dual Input', summary: "Weighted mix of two images.", traits: ['dual'] },
	Mask: { category: 'Dual Input', summary: "Binary stencil - keeps the first image where the mask is light, blacks it out where the mask is dark.", traits: ['dual'] },
	Multiply: { category: 'Dual Input', summary: "Multiplies the two images together, channel by channel.", traits: ['dual'] },

	// --- Misc ---
	Brickulate: { category: 'Misc', summary: "Overlays a brick/tile grid with bevelled grooves." },
	DifferenceDetector: { category: 'Misc', summary: "Compares each frame against the first one it saw.", traits: ['temporal'] },
	Ghoster: { category: 'Misc', summary: "Onion-skins the last N frames together, weighted towards the newest.", traits: ['temporal'] },
	Puzzler: { category: 'Misc', summary: "Scrambles the image into shuffled tiles." },
};
