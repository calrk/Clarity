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

/** NormalIntensity and NormalFlip take a normal map, not a height map. */
const NORMAL = [{ filter: 'NormalGenerator', options: { intensity: 1 } }];

export const cases = [
	// --- Process: pointwise ---------------------------------------------
	{ filter: 'Invert', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Invert', name: 'dynamic', input: 'photo', options: { dynamic: true }, gpu: POINTWISE },
	{ filter: 'Desaturate', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'hsvShifter', input: 'photo', options: { hue: 120, saturation: 1.4, value: 0.9 }, gpu: POINTWISE },
	{ filter: 'HanoverBars', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'HanoverBars', name: 'offset', input: 'photo', options: { offset: true }, gpu: POINTWISE },
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
	{ filter: 'Posteriser', name: 'fast', input: 'photo', options: { method: 'fast', colours: 6 }, gpu: BOUNDARY },
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
	{ filter: 'Contourer', input: 'heightmap', options: { contours: 6 }, gpu: BOUNDARY },

	// --- Transform (gather/scatter; odd sizes matter) --------------------
	{ filter: 'Mirror', input: 'photo', options: { Horizontal: true }, gpu: POINTWISE },
	{ filter: 'Mirror', name: 'both-odd', input: 'odd', options: { Horizontal: true, Vertical: true }, gpu: POINTWISE },
	{ filter: 'Rotator', input: 'photo', options: { turns: 1 }, gpu: POINTWISE },
	{ filter: 'Rotator', name: 'half', input: 'photo', options: { turns: 2 }, gpu: POINTWISE },
	{ filter: 'Translator', input: 'photo', options: { horizontal: 0.25, vertical: 0.1 }, gpu: POINTWISE },
	{ filter: 'Tiler', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Tiler', name: 'odd', input: 'odd', options: {}, gpu: POINTWISE },
	{ filter: 'ChannelSeparate', input: 'photo', options: { xdistance: 4, ydistance: 2, fixed: true }, gpu: POINTWISE },
	{ filter: 'Wave', input: 'photo', options: { vertical: true, amplitude: 5, frequency: 12 }, now: 0, gpu: POINTWISE },
	{ filter: 'Wave', name: 'both', input: 'photo', options: { horizontal: true, vertical: true, amplitude: 4 }, now: 250, gpu: POINTWISE },

	// --- Starters --------------------------------------------------------
	{ filter: 'FillRGB', input: 'photo', options: { red: 200, green: 80, blue: 40 }, gpu: POINTWISE },
	{ filter: 'FillHSV', input: 'photo', options: { hue: 200, saturation: 0.8, value: 0.9 }, gpu: POINTWISE },
	{ filter: 'Cloud', input: 'photo', options: { red: 255, green: 200, blue: 120, iterations: 3, initialSize: 4 }, seed: 7, gpu: ACCUMULATING },

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
