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
		look: 'Dark wherever either input is dark; the disc keeps the first image, the surround goes near-black. The "alpha" case multiplies a part-transparent frame: the colour is shaded and the transparency is exactly as it arrived, which is what makes the filter usable for shading a sprite.',
		note: 'The first frame is the subject and the second is the shading, and it is the first frame\'s alpha that comes out - true of every two-input filter here. It matters most in this one: multiplying a cloud through a sprite is the obvious way to give it texture, and while this assigned 255 the answer came back as a rectangle with the silhouette thrown away.'
	},
	Stamper: {
		look: 'Blades of grass scattered evenly over the photo, each tapering to a bright tip at the top and leaning right. Evenly spaced but not in rows - one per cell, nudged off centre, and each drawn a shade lighter or darker than the last so they read as individuals rather than as copies. The photo shows through everywhere a blade does not cover, and through the soft edges of the ones that do. In "shaded" that variation is turned up to its limit, and the thing to check is that a dark blade is *dark* rather than *faded* - the photo must not show through it. In "unwrapped" the blades are cut off at the frame edge instead of reappearing on the opposite side, so the sky shows in the top right corner where the wrapped copies used to be.',
		note: 'The second input is a sprite, not a picture: it keeps its own 12x20 size instead of being stretched to the frame, and its alpha is what decides the shape. Hand it something opaque and this scatters rectangles. The "sown" case adds a third input - a height map read as a probability map - so the blades crowd onto its two peaks and thin out to bare ground in the corners, every surviving blade whole rather than faded. The "alpha" case stamps onto ground that is itself part transparent: the blades composite onto it rather than sealing it over, so they come out solid while the gaps between them stay exactly as clear as they arrived - which is how you scatter something into a sprite rather than onto a picture.'
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
	Dither: {
		look: 'A gradient that would band comes out stippled instead. Ordered leaves a visible crosshatch and diffusion leaves no pattern at all; monochrome is the one-bit newsprint end of it.',
		note: 'The one honest use of supportsGPU: Bayer is a pure gather and runs as a shader, Floyd-Steinberg pushes error into pixels it has not visited yet and cannot.'
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
		look: 'Black on the photo fixture, which has no skin tones in it - a big white area there would be suspicious. On the tone fixture the top five rows should be solidly white across their whole width, and the bottom four solidly black.',
		note: 'The tone case is the one worth reading. A white band that stops short of the right-hand edge means the deeper tones have dropped out, which is the failure this filter had: chroma is an offset from neutral grey and shrinks with the brightness carrying it, so a fixed Cb/Cr box has margin to spare on pale skin and none at all on dark. Rows two to five are the same tones underexposed, because shadow is where that gives out first.'
	},

	// --- Starters ---
	Cloud: {
		look: 'Soft organic blotches in grey, not a uniform fill and not white static. Opaque, like every other starter.'
	},
	Woodgrain: {
		look: 'Long horizontal grain with dark growth rings and fine pore lines through the pale wood. End grain is the same field unstretched - concentric rings around a centre, which is a stump rather than a plank.',
		note: 'Grey on purpose, following Gradient: a ramp downstream is one stage against several colour properties nobody sets, and GradientMap sepia turns this into timber.'
	},
	Fill: {
		look: 'Completely flat colour, matching the one asked for exactly. Any structure left over means the fill is not covering.',
		note: 'The hex and hsv cases are the same colour reached two ways and must come out identical - that equivalence is the whole argument for one Fill rather than a filter per colour model.'
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
	Displace: {
		look: 'Content pushed around in two axes independently, following the field rather than a repeating wave. Smooth - no stair-stepping along the flat parts of the field, which is what tells you the bilinear read is working.',
		note: 'Wants a normal map, not a height map. A greyscale field has red equal to green, so every pixel moves the same way and the whole frame shears along one diagonal - run NormalGenerator over a height map first and the two axes come apart. The "alpha" case pushes a part-transparent frame around: transparency travels with the pixel it belongs to, so what moves is a shape rather than a rectangle, and the check is that no edge has picked up a halo of colour from the transparent side of itself.'
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
