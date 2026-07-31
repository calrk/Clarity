// Per-filter blurb for the contact sheet: what it does, and - more usefully -
// what you should actually be able to see in the before/after pair.
//
// `note` flags something worth a decision when you look at it.
//
// These will move into the per-filter schema when #8 lands; keeping them here
// for now avoids blocking the contact sheet on that work.

export const descriptions = {
	// --- Dual input ---
	AddSub: {
		summary: 'Adds the second image to the first, or subtracts it.',
		look: 'The disc region should blow out to white (add) or crush to black (subtract).'
	},
	Blend: {
		summary: 'Weighted mix of two images.',
		look: 'Both images visible at once; at ratio 0.35 the disc dominates.'
	},
	Mask: {
		summary: 'Keeps the first image only where the mask image is dark.',
		look: 'The disc is black and everything around it survives.',
		note: 'Inverted relative to the README, which says "white is shown and black is not" and calls this an implementation of multiply - where white should mean keep. Worth deciding which is right.'
	},
	Multiply: {
		summary: 'Multiplies the two images together, channel by channel.',
		look: 'Dark wherever either input is dark; the disc keeps the first image, the surround goes near-black.'
	},

	// --- Height map ---
	Contourer: {
		summary: 'Bands a height map into discrete contour steps.',
		look: 'Concentric rings around each peak, with hard edges between bands.'
	},
	NormalFlip: {
		summary: 'Flips or swaps the X/Y axes of a normal map.',
		look: 'Colours shift channel-wise; the surface structure stays put.'
	},
	NormalGenerator: {
		summary: 'Derives a tangent-space normal map from a height map.',
		look: 'The flat lilac of a neutral normal, with slopes tinting towards red/green on the peak flanks.'
	},
	NormalIntensity: {
		summary: 'Strengthens or weakens the X/Y tilt of an existing normal map.',
		look: 'Same structure, more or less colour saturation away from neutral.'
	},

	// --- Process ---
	Bleed: {
		summary: 'Blurs a single channel, so colour bleeds out of its edges.',
		look: 'Softening that affects one channel more than the others.'
	},
	Blur: {
		summary: 'Stack blur - a fast Gaussian approximation.',
		look: 'Uniformly soft; the grain in the sky should be gone.'
	},
	Desaturate: {
		summary: 'Drops colour, keeping luminance.',
		look: 'Fully grey. The sky/ground split stays legible.'
	},
	DotRemover: {
		summary: 'Removes isolated pixels from a binary image - a clean-up pass for the output of an edge detector or thresholder.',
		look: 'The scattered specks should be gone; the solid block, disc and line survive intact.',
		note: 'Likely superseded by proper morphological bloat/erode (FEATURES.md #9), which generalises past binary images.'
	},
	Glow: {
		summary: 'Blurs the image and blends the blur back over the original.',
		look: 'Bright areas bloom outwards; edges stay roughly in place.'
	},
	HanoverBars: {
		summary: 'Applies Hanover bars / scan lines by rotating chroma on alternate line pairs.',
		look: 'Horizontal banding every 4 rows, colour-shifted rather than darkened.'
	},
	Invert: {
		summary: 'Inverts colour. In dynamic mode it reflects within the image\'s own range.',
		look: 'Sky goes orange, ground goes purple. Dynamic mode is subtler than plain invert.'
	},
	Noise: {
		summary: 'Adds random noise, optionally monochromatic.',
		look: 'Visible grain. Monochromatic shifts all three channels together, so it stays grey rather than speckled with colour.'
	},
	Pixelate: {
		summary: 'Snaps the image to fixed-size blocks.',
		look: 'Hard square blocks at exactly the requested size, with partial blocks at the right and bottom edges when the frame does not divide evenly.'
	},
	Posteriser: {
		summary: 'Quantises to a fixed number of colours via median cut.',
		look: 'Flat bands of colour with no gradient inside them. Exactly 6 distinct colours here.'
	},
	Sharpen: {
		summary: 'Kernel sharpen, enhancing local contrast.',
		look: 'Edges crisper, grain more pronounced. Subtle at intensity 0.6.'
	},
	Smoother: {
		summary: 'Averages each pixel with its four neighbours, repeatedly.',
		look: 'Gentle softening, less aggressive than Blur. Two passes compound.'
	},
	hsvShifter: {
		summary: 'Rotates hue and scales saturation/value.',
		look: 'A 120 degree hue rotation: blue sky becomes red-ish, green ground becomes blue-ish.'
	},

	// --- Salience ---
	EdgeDetector: {
		summary: 'Highlights edges with a 3x3 kernel, or a fast two-sample difference.',
		look: 'White on the block boundaries and the two test lines; flat areas black.'
	},
	MotionDetector: {
		summary: 'Absolute difference between the current frame and one N frames back.',
		look: 'Bright where the two fixtures differ - the disc region - and black where they agree.'
	},
	SkinDetector: {
		summary: 'Thresholds YCbCr into a binary skin/not-skin mask.',
		look: 'Mostly black on this fixture, which has no skin tones. A big white area would be suspicious.'
	},

	// --- Starters ---
	Cloud: {
		summary: 'Fills the frame with tinted value-noise clouds.',
		look: 'Soft organic blotches, not a uniform fill and not white static.',
		note: 'Alpha is derived from the colour options rather than being opaque, so with default options the output is fully transparent.'
	},
	FillHSV: {
		summary: 'Fills the frame with one colour, specified in HSV.',
		look: 'Completely flat colour. Any structure left over means the fill is not covering.'
	},
	FillRGB: {
		summary: 'Fills the frame with one colour, specified in RGB.',
		look: 'Completely flat colour, matching the requested RGB exactly.'
	},

	// --- Thresholders ---
	GradientThreshold: {
		summary: 'Marks pixels whose neighbours differ by more than a threshold - edge detection by another route.',
		look: 'Outlines around the blocks and lines, interiors black.'
	},
	MedianThreshold: {
		summary: 'Quantises using median and quartile pixel values.',
		look: 'A small number of flat tones split around the image median.'
	},
	ValueThreshold: {
		summary: 'Two-tone threshold at a given value, or one derived from the image.',
		look: 'Pure black and white only. Inverted swaps which side is which; auto picks the split itself.'
	},

	// --- Transform ---
	ChannelSeparate: {
		summary: 'Offsets the R and G channels in opposite directions.',
		look: 'Colour fringing on edges, like chromatic aberration.'
	},
	Mirror: {
		summary: 'Flips the image horizontally, vertically, or both.',
		look: 'Content reflected. On the odd fixture the diagonal gradient should run the other way.'
	},
	Rotator: {
		summary: 'Rotates in 90 degree steps.',
		look: 'Content turned a quarter or half turn.',
		note: 'On a non-square frame the crop path is still approximate - see FEATURES.md #1. Expect a cropped region rather than a clean rotation here.'
	},
	Tiler: {
		summary: 'Tiles the image so its edges line up seamlessly.',
		look: 'Four mirrored quadrants meeting without a visible seam.'
	},
	Translator: {
		summary: 'Shifts the image by a percentage, wrapping at the edges.',
		look: 'Content moved, with the part that fell off one edge reappearing on the other.'
	},
	Wave: {
		summary: 'Displaces pixels along a sine function.',
		look: 'Rippling distortion. No black gaps - it gathers rather than scatters, so every output pixel is written.'
	},

	// --- Misc ---
	Brickulate: {
		summary: 'Overlays a brick/tile grid with bevelled grooves.',
		look: 'A regular grid of bright groove lines over the image.'
	},
	DifferenceDetector: {
		summary: 'Compares each frame against the first one it saw.',
		look: 'The original image shows through where the frames differ, black where they match.'
	},
	Ghoster: {
		summary: 'Onion-skins the last N frames together, weighted towards the newest.',
		look: 'The newest frame dominant with earlier ones faintly behind it.'
	},
	LIFX: {
		summary: 'Finds the average position of bright pixels and maps it to a colour, for driving a lamp.',
		look: 'Bright regions recoloured to a single hue, everything else black. Field mode shows the UV colour space instead.'
	},
	Puzzler: {
		summary: 'Scrambles the image into shuffled tiles.',
		look: 'Rectangular tiles rearranged. Every tile from the input should appear exactly once.'
	}
};

/** Directory each filter lives in, used to group the sheet. */
export const categories = {
	AddSub: 'Dual Input', Blend: 'Dual Input', Mask: 'Dual Input', Multiply: 'Dual Input',
	Contourer: 'Height Map', NormalFlip: 'Height Map', NormalGenerator: 'Height Map', NormalIntensity: 'Height Map',
	Bleed: 'Process', Blur: 'Process', Desaturate: 'Process', DotRemover: 'Process', Glow: 'Process',
	HanoverBars: 'Process', Invert: 'Process', Noise: 'Process', Pixelate: 'Process', Posteriser: 'Process',
	Sharpen: 'Process', Smoother: 'Process', hsvShifter: 'Process',
	EdgeDetector: 'Salience', MotionDetector: 'Salience', SkinDetector: 'Salience',
	Cloud: 'Starters', FillHSV: 'Starters', FillRGB: 'Starters',
	GradientThreshold: 'Thresholders', MedianThreshold: 'Thresholders', ValueThreshold: 'Thresholders',
	ChannelSeparate: 'Transform', Mirror: 'Transform', Rotator: 'Transform', Tiler: 'Transform',
	Translator: 'Transform', Wave: 'Transform',
	Brickulate: 'Misc', DifferenceDetector: 'Misc', Ghoster: 'Misc', LIFX: 'Misc', Puzzler: 'Misc'
};

export const CATEGORY_ORDER = [
	'Process', 'Thresholders', 'Salience', 'Transform', 'Height Map', 'Starters', 'Dual Input', 'Misc'
];
