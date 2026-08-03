// Golden-image cases: one entry per filter (sometimes more, where a second
// input exercises a different code path).
//
// Each case carries two independent things:
//
//   options  - constructor options, fixed so output is reproducible. Filters
//              that use randomness or time get `seed` / `now`, which the runner
//              turns into an injected RandomSource / Clock.
//
//   pre      - optional chain of filters run over the fixture first, for filters
//              that only make sense downstream of another one. Same shape as a
//              case. The contact sheet shows the prepared frame as the "before"
//              image, so the pair reads as the pipeline it really is.
//
//   gpu      - how the GPU implementation will be compared against the CPU one
//              in #3. Unused until then, but it belongs with the case rather
//              than in the GPU harness, because the right metric is a property
//              of the filter:
//
//                tolerance  - every channel within N. For pointwise and
//                             accumulating filters, where GPU/CPU rounding
//                             differences are small and evenly spread.
//                population - pixels may differ arbitrarily, but at most N% of
//                             them may differ at all. For filters with a hard
//                             decision boundary, where a one-unit input
//                             difference flips a pixel between 0 and 255 and a
//                             per-channel tolerance is meaningless.
//
// CPU output is always compared against its golden *exactly* - it is
// deterministic, so any difference at all is a regression.

const POINTWISE = { mode: 'tolerance', tolerance: 1 };
const ACCUMULATING = { mode: 'tolerance', tolerance: 3 };
const KERNEL = { mode: 'tolerance', tolerance: 2 };
/** Hard decision boundaries - see the note above. */
const BOUNDARY = { mode: 'population', maxDifferentRatio: 0.02 };
/**
 * Quantised into bands: interiors agree to rounding, edges can flip a whole
 * band. Neither of the other two metrics describes that shape.
 */
const BANDED = { mode: 'banded', tolerance: 1, maxFlippedRatio: 0.01 };

/** NormalIntensity and NormalFlip take a normal map, not a height map. */
const NORMAL = [{ filter: 'NormalGenerator', options: { intensity: 1 } }];

export const cases = [
	// --- Process: pointwise ---------------------------------------------
	{ filter: 'Invert', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: "Invert", name: "dynamic", input: "photo", options: { dynamic: true }, gpu: POINTWISE },
	{ filter: 'Desaturate', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Desaturate', name: 'partial', input: 'photo', options: { amount: 0.4 }, gpu: POINTWISE },
	{ filter: 'hsvShifter', input: 'photo', options: { hue: 120, saturation: 1.4, value: 0.9 }, gpu: POINTWISE },
	{ filter: 'HanoverBars', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'HanoverBars', name: 'scanlines', input: 'photo', options: { mode: 'scanlines' }, gpu: POINTWISE },
	{ filter: 'HanoverBars', name: 'vertical', input: 'photo', options: { mode: 'scanlines', width: 5, vertical: true }, gpu: POINTWISE },
	{ filter: 'Noise', input: 'photo', options: { intensity: 40 }, seed: 1, gpu: POINTWISE },
	{ filter: 'Noise', name: 'mono', input: 'photo', options: { intensity: 40, monochromatic: true }, seed: 1, gpu: POINTWISE },

	// --- Process: neighbourhood -----------------------------------------
	{ filter: 'Blur', input: 'photo', options: { radius: 6 }, gpu: ACCUMULATING },
	{ filter: 'Bleed', input: 'photo', options: { radius: 6 }, gpu: ACCUMULATING },
	{ filter: 'Glow', input: 'photo', options: { radius: 6 }, gpu: ACCUMULATING },
	{ filter: 'Smoother', input: 'photo', options: { iterations: 2 }, gpu: KERNEL },
	{ filter: 'Sharpen', input: 'photo', options: { intensity: 0.6 }, gpu: KERNEL },
	{ filter: 'Pixelate', input: 'photo', options: { size: 8 }, gpu: POINTWISE },
	// odd dimensions: 33 is not a multiple of 8, so the right column is partial
	{ filter: 'Pixelate', name: 'odd', input: 'odd', options: { size: 8 }, gpu: POINTWISE },
	{ filter: 'Posteriser', input: 'photo', options: { colours: 6 }, gpu: BOUNDARY },
	// The fast method lands on band centres like 21.5, and the two paths break
	// that tie in opposite directions - Uint8ClampedArray rounds half to even,
	// the framebuffer conversion rounds half up. Every pixel is within 1, which
	// is a tolerance question rather than a boundary one.
	{ filter: 'Posteriser', name: 'fast', input: 'photo', options: { method: 'fast', colours: 6 }, gpu: POINTWISE },
	{ filter: 'DotRemover', input: 'binary', options: {}, gpu: BOUNDARY },

	// --- Thresholders (hard boundaries) ---------------------------------
	{ filter: 'ValueThreshold', input: 'photo', options: { threshold: 120 }, gpu: BOUNDARY },
	{ filter: 'ValueThreshold', name: 'auto', input: 'photo', options: {}, gpu: BOUNDARY },
	{ filter: 'ValueThreshold', name: 'inverted', input: 'photo', options: { threshold: 120, inverted: true }, gpu: BOUNDARY },
	{ filter: 'GradientThreshold', input: 'edges', options: { threshold: 30, distance: 1 }, gpu: BOUNDARY },
	{ filter: 'MedianThreshold', input: 'photo', options: {}, gpu: BOUNDARY },

	// --- Salience --------------------------------------------------------
	{ filter: 'EdgeDetector', input: 'edges', options: {}, gpu: KERNEL },
	{ filter: 'EdgeDetector', name: 'fast', input: 'edges', options: { fast: true }, gpu: KERNEL },
	{ filter: 'SkinDetector', input: 'photo', options: {}, gpu: BOUNDARY },
	// stateful: needs a frame sequence, so the runner feeds it `passes` frames
	{ filter: 'MotionDetector', input: ['clean', 'moved'], sequence: true, options: { frameCount: 1 }, gpu: POINTWISE },

	// --- Height map ------------------------------------------------------
	{ filter: 'NormalGenerator', input: 'heightmap', options: { intensity: 1 }, gpu: KERNEL },
	{ filter: 'NormalIntensity', input: 'heightmap', pre: NORMAL, options: { intensity: 1.5 }, gpu: POINTWISE },
	{ filter: 'NormalFlip', input: 'heightmap', pre: NORMAL, options: { red: true, swap: true }, gpu: POINTWISE },
	// Banding needs its own metric: within a band the two paths agree to
	// rounding, but a pixel sitting on a band edge can land in the neighbouring
	// band and be out by a whole step. A tolerance fails on the edges, a
	// population budget fails on the interiors.
	{ filter: 'Contourer', input: 'heightmap', options: { contours: 6 }, gpu: BANDED },

	// --- Transform (gather/scatter; odd sizes matter) --------------------
	{ filter: 'Mirror', input: 'photo', options: { Horizontal: true }, gpu: POINTWISE },
	{ filter: 'Mirror', name: 'both-odd', input: 'odd', options: { Horizontal: true, Vertical: true }, gpu: POINTWISE },
	{ filter: 'Rotator', input: 'photo', options: { turns: 1 }, gpu: POINTWISE },
	{ filter: 'Rotator', name: 'half', input: 'photo', options: { turns: 2 }, gpu: POINTWISE },
	//the two fits only differ on a non-square frame, and the fixture is 4:3
	{ filter: 'Rotator', name: 'crop', input: 'photo', options: { turns: 1, fit: 'crop' }, gpu: POINTWISE },
	{ filter: 'Rotator', name: 'anticlockwise', input: 'photo', options: { turns: 3 }, gpu: POINTWISE },
	{ filter: 'Translator', input: 'photo', options: { horizontal: 0.25, vertical: 0.1 }, gpu: POINTWISE },
	{ filter: 'Tiler', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Tiler', name: 'odd', input: 'odd', options: {}, gpu: POINTWISE },
	{ filter: 'ChromaticAberration', input: 'photo', options: { xdistance: 4, ydistance: 2, fixed: true }, gpu: POINTWISE },
	//the ramped mode had no case at all, so the inverted ramp went unnoticed
	{ filter: 'ChromaticAberration', name: 'ramped', input: 'photo', options: { xdistance: 6, ydistance: 3 }, gpu: POINTWISE },
	// Wave floors a sine to pick which texel to read, which is a hard decision
	// boundary in the same sense a thresholder is: the GPU works in 32-bit
	// floats where the CPU has 64, so a value sitting a fraction either side of
	// an integer lands on a different source pixel. The pixel is then wrong by
	// however different its neighbour happens to be, which a per-channel
	// tolerance cannot express.
	{ filter: 'Wave', input: 'photo', options: { vertical: true, amplitude: 5, frequency: 12 }, now: 0, gpu: { mode: 'population', maxDifferentRatio: 0.05 } },
	{ filter: 'Wave', name: 'both', input: 'photo', options: { horizontal: true, vertical: true, amplitude: 4 }, now: 250, gpu: { mode: 'population', maxDifferentRatio: 0.05 } },

	// --- Starters --------------------------------------------------------
	{ filter: 'FillRGB', input: 'photo', options: { red: 200, green: 80, blue: 40 }, gpu: POINTWISE },
	{ filter: 'FillHSV', input: 'photo', options: { hue: 200, saturation: 0.8, value: 0.9 }, gpu: POINTWISE },
	{ filter: 'Cloud', input: 'photo', options: { red: 255, green: 200, blue: 120, iterations: 3, initialSize: 4 }, seed: 7, gpu: ACCUMULATING },
	// alpha derived from the colour rather than opaque - the texture-mask mode,
	// and the only case that exercises a non-255 alpha out of a starter
	{ filter: 'Cloud', name: 'mask', input: 'photo', options: { red: 255, green: 200, blue: 120, opaque: false, iterations: 3, initialSize: 4 }, seed: 7, gpu: ACCUMULATING },

	// --- Dual input ------------------------------------------------------
	{ filter: 'Blend', input: ['photo', 'second'], options: { ratio: 0.35 }, gpu: POINTWISE },
	{ filter: 'Add', input: ['photo', 'second'], options: {}, gpu: POINTWISE },
	{ filter: 'Subtract', input: ['photo', 'second'], options: {}, gpu: POINTWISE },
	{ filter: 'Mask', input: ['photo', 'second'], options: {}, gpu: BOUNDARY },
	{ filter: 'Mask', name: 'inverted', input: ['photo', 'second'], options: { inverted: true }, gpu: BOUNDARY },
	{ filter: 'Multiply', input: ['photo', 'second'], options: {}, gpu: POINTWISE },

	// --- Misc ------------------------------------------------------------
	{ filter: 'Brickulate', input: 'photo', options: { horizontalSegs: 4, verticalSegs: 3, grooveSize: 3 }, gpu: POINTWISE },
	{ filter: 'Puzzler', input: 'photo', options: { horizontalSegs: 4, verticalSegs: 3 }, seed: 3, gpu: POINTWISE },
	// the blue tint on a tile waiting for its swap partner is a whole branch
	// nothing else reaches, and it travels in the data texture rather than a
	// uniform because a click is not a property change
	{ filter: 'Puzzler', name: 'selected', input: 'photo', options: { horizontalSegs: 4, verticalSegs: 3 }, seed: 3, selects: [[1, 2]], gpu: POINTWISE },
	// stateful pair: first frame is the reference, second is the comparison
	{ filter: 'DifferenceDetector', input: ['clean', 'moved'], sequence: true, options: {}, gpu: BOUNDARY },
	{ filter: 'Ghoster', input: ['clean', 'moved'], sequence: true, options: { length: 3 }, gpu: ACCUMULATING },

	// --- Alpha handling ---------------------------------------------------
	// most filters rewrite alpha to 255; these pin that behaviour down so a
	// future change to alpha handling shows up as a diff rather than silently
	{ filter: 'Desaturate', name: 'alpha', input: 'alpha', options: {}, gpu: POINTWISE },
	{ filter: 'Blur', name: 'alpha', input: 'alpha', options: { radius: 4 }, gpu: ACCUMULATING }
];

/** `Filter-name.png`, or `Filter.png` when the case has no variant name. */
export function caseName(entry) {
	return entry.name ? `${entry.filter}-${entry.name}` : entry.filter;
}
