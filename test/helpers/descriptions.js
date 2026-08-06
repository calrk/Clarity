// What you should actually be able to see in each before/after pair.
//
// The one-line summary and the category come from the library's own CATALOGUE
// - it knows what its filters are for. What stays here is the part that only
// makes sense while looking at a contact sheet: what to check, and what is
// worth a decision when you see it.

export { CATALOGUE, CATEGORY_ORDER } from '../../dist/clarity.js';

export const descriptions = {
	// --- Dual input ---
	Add: {
		look: 'The disc region blows out to white; the dark surround barely lifts the photo.'
	},
	Subtract: {
		look: 'The disc region crushes to black; the dark surround barely dims the photo.'
	},
	Blend: {
		look: 'Both images visible at once; at ratio 0.35 the disc dominates.'
	},
	Mask: {
		look: 'The photo survives inside the white disc and everything around it is black. Inverted swaps which side is kept.',
		note: 'Not the same as Multiply, despite the old README calling it one. Mask has a hard cut-off at the threshold, so a pixel is either fully kept or fully dropped; Multiply is continuous, so a 50% grey mask halves the image instead.'
	},
	Multiply: {
		look: 'Dark wherever either input is dark; the disc keeps the first image, the surround goes near-black.'
	},

	// --- Height map ---
	Contourer: {
		look: 'Concentric rings around each peak, with hard edges between bands.'
	},
	NormalFlip: {
		look: 'Compared to the generated normal map on the left, the red and green channels have traded places and red is inverted - the surface structure stays exactly where it was.'
	},
	NormalGenerator: {
		look: 'The flat lilac of a neutral normal, with slopes tinting towards red/green on the peak flanks.'
	},
	NormalIntensity: {
		look: 'Same structure as the generated normal map on the left, pushed further from neutral lilac on the slopes.'
	},

	// --- Process ---
	Bleed: {
		look: 'Softening that affects one channel more than the others.'
	},
	Blur: {
		look: 'Uniformly soft; the grain in the sky should be gone.'
	},
	Desaturate: {
		look: 'Fully grey at amount 1; the partial variant keeps some colour but less of it. The sky/ground split stays legible either way.'
	},
	DotRemover: {
		look: 'The scattered specks should be gone; the solid block, disc and line survive intact.',
		note: 'Likely superseded by proper morphological bloat/erode (FEATURES.md #9), which generalises past binary images.'
	},
	Glow: {
		look: 'Bright areas bloom outwards; edges stay roughly in place.'
	},
	HanoverBars: {
		look: 'Banding every other bar - colour-shifted in hanover mode, darkened in scanlines mode, and running down the frame rather than across it when vertical. Either way it must not be identical to the input.'
	},
	Halftone: {
		look: 'A grid of dots on flat white, turned 45 degrees, with the big dots where the picture is dark. Newsprint drops the colour and keeps the tone; wide fills the dark cells solid on a black ground, which is the same reading the other way up.',
		note: 'Dot radius goes as the square root of coverage, because tone follows the dot area rather than its width. A radius linear in coverage makes every midtone far too light.'
	},
	Invert: {
		look: 'Sky goes orange, ground goes purple. Dynamic mode is subtler than plain invert.'
	},
	Noise: {
		look: 'Visible grain. Monochromatic shifts all three channels together, so it stays grey rather than speckled with colour.'
	},
	Pixelate: {
		look: 'Hard square blocks at exactly the requested size, with partial blocks at the right and bottom edges when the frame does not divide evenly.'
	},
	Posteriser: {
		look: 'Flat bands of colour with no gradient inside them. Exactly 6 distinct colours here.'
	},
	Sharpen: {
		look: 'Edges crisper, grain more pronounced. Subtle at intensity 0.6.'
	},
	Smoother: {
		look: 'Gentle softening, less aggressive than Blur. Two passes compound.'
	},
	hsvShifter: {
		look: 'A 120 degree hue rotation: blue sky becomes red-ish, green ground becomes blue-ish.'
	},

	// --- Salience ---
	EdgeDetector: {
		look: 'White on the block boundaries and the two test lines; flat areas black.'
	},
	MotionDetector: {
		look: 'Bright where the two fixtures differ - the disc region - and black where they agree.'
	},
	SkinDetector: {
		look: 'Mostly black on this fixture, which has no skin tones. A big white area would be suspicious.'
	},

	// --- Starters ---
	Cloud: {
		look: 'Soft organic blotches, not a uniform fill and not white static. Opaque by default; the mask variant derives alpha from the colour instead, so it reads as a texture mask.'
	},
	FillHSV: {
		look: 'Completely flat colour. Any structure left over means the fill is not covering.'
	},
	FillRGB: {
		look: 'Completely flat colour, matching the requested RGB exactly.'
	},

	// --- Thresholders ---
	GradientThreshold: {
		look: 'Outlines around the blocks and lines, interiors black.'
	},
	MedianThreshold: {
		look: 'A small number of flat tones split around the image median.'
	},
	ValueThreshold: {
		look: 'Pure black and white only. Inverted swaps which side is which; auto picks the split itself.'
	},

	// --- Transform ---
	ChromaticAberration: {
		look: 'Colour fringing on edges. Absent at the centre and growing toward the corners, unless fixed, which displaces uniformly.'
	},
	Mirror: {
		look: 'Content reflected. On the odd fixture the diagonal gradient should run the other way.'
	},
	Rotator: {
		look: 'Content turned a quarter or half turn. A quarter turn of the 4:3 fixture comes back 3:4 - taller than it is wide - unless fit is crop, which returns a square.'
	},
	Tiler: {
		look: 'Four mirrored quadrants meeting without a visible seam - and, critically, no bright cross down the centre rows and columns.'
	},
	Translator: {
		look: 'Content moved, with the part that fell off one edge reappearing on the other.'
	},
	Wave: {
		look: 'Rippling distortion. No black gaps - it gathers rather than scatters, so every output pixel is written.'
	},

	// --- Misc ---
	Brickulate: {
		look: 'A regular grid of bright groove lines over the image.'
	},
	DifferenceDetector: {
		look: 'The original image shows through where the frames differ, black where they match.'
	},
	Ghoster: {
		look: 'The newest frame dominant with earlier ones faintly behind it.'
	},
	Puzzler: {
		look: 'Rectangular tiles rearranged. Every tile from the input should appear exactly once.'
	}
};
