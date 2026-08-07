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
/**
 * Antialiased dots, plus a rare arbitrary one.
 *
 * Halftone's edges are antialiased over a pixel, so almost everything agrees to
 * rounding - a hard-edged dot would need the population metric the way Voronoi's
 * cells do. What it cannot make continuous is *which* dot owns a pixel that two
 * overlapping ones both cover: the strongest wins, and where they are within a
 * fraction of a percent of each other that choice is undetermined. Measured on
 * the odd fixture, one pixel in 825 lands there, and the two cells it is
 * choosing between were sampling colours 44 apart.
 *
 * The same shape as `banded` - agreement everywhere, a hard flip on a decision
 * boundary - so it uses the same mode rather than a fourth one.
 */
const DOTS = { mode: 'banded', tolerance: 2, maxFlippedRatio: 0.005 };
/**
 * The same thing, with four screens instead of one.
 *
 * Each screen samples its cell's colour at a computed centre, and that goes
 * through a `floor`, so a centre landing near a pixel boundary reads one source
 * pixel on the CPU and its neighbour on the GPU - the hazard `FishEye` already
 * carries. CMYK is more exposed to it than the single-screen modes for two
 * reasons that compound: there are four screens rather than one, and what the
 * flip changes is an ink's *coverage*, which is then multiplied by the other
 * three rather than merely nudging a dot's edge.
 *
 * Measured on the photo fixture: 2268 pixels of 3072 agree exactly, 766 are
 * within 2, and 38 differ by more - worst 49. Structureless, which is what says
 * this is the boundary and not a disagreement about the arithmetic.
 */
const DOTS_MULTI = { mode: 'banded', tolerance: 2, maxFlippedRatio: 0.02 };

/** NormalIntensity and NormalFlip take a normal map, not a height map. */
const NORMAL = [{ filter: 'NormalGenerator', options: { intensity: 1 } }];

export const cases = [
	// --- Process: pointwise ---------------------------------------------
	{ filter: 'Invert', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Levels', input: 'photo', options: { black: 40, white: 210 }, gpu: POINTWISE },
	{ filter: 'Levels', name: 'gamma', input: 'photo', options: { gamma: 2.2 }, gpu: POINTWISE },
	{ filter: "Invert", name: "dynamic", input: "photo", options: { dynamic: true }, gpu: POINTWISE },
	{ filter: 'Desaturate', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Desaturate', name: 'partial', input: 'photo', options: { amount: 0.4 }, gpu: POINTWISE },
	{ filter: 'Vignette', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Vignette', name: 'hard', input: 'photo', options: { amount: 1, radius: 0.7, softness: 0 }, gpu: POINTWISE },
	{ filter: 'hsvShifter', input: 'photo', options: { hue: 120, saturation: 1.4, value: 0.9 }, gpu: POINTWISE },
	{ filter: 'HanoverBars', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'HanoverBars', name: 'scanlines', input: 'photo', options: { mode: 'scanlines' }, gpu: POINTWISE },
	{ filter: 'HanoverBars', name: 'vertical', input: 'photo', options: { mode: 'scanlines', width: 5, vertical: true }, gpu: POINTWISE },
	{ filter: 'Noise', input: 'photo', options: { intensity: 40 }, seed: 1, gpu: POINTWISE },
	{ filter: 'Noise', name: 'mono', input: 'photo', options: { intensity: 40, monochromatic: true }, seed: 1, gpu: POINTWISE },

	// --- Process: neighbourhood -----------------------------------------
	{ filter: 'Blur', input: 'photo', options: { radius: 6 }, gpu: ACCUMULATING },
	{ filter: 'Bleed', input: 'photo', options: { radius: 6 }, gpu: ACCUMULATING },
	// POINTWISE rather than ACCUMULATING, which is what 289 weighted samples
	// summed per pixel would suggest. Measured at tolerance 0, exactly one pixel
	// of 3072 differs at all, by 1 - the weights fall off fast enough that the
	// sum is dominated by a handful of near-1 terms, so float32 and float64 have
	// very little room to drift apart. The three-and-the-cartoon cases hold to
	// the same tolerance even through three ping-ponged passes.
	{ filter: 'Bilateral', input: 'photo', options: { radius: 4, similarity: 30 }, gpu: POINTWISE },
	// the fixture of hard-edged flat blocks, which is the claim: the blocks
	// should smooth and the boundaries between them should not move
	{ filter: 'Bilateral', name: 'edges', input: 'edges', options: { radius: 5, similarity: 25 }, gpu: POINTWISE },
	// several small passes rather than one big one - the cartoon look, and the
	// case that exercises the shader pass's `repeat`
	{ filter: 'Bilateral', name: 'cartoon', input: 'photo', options: { radius: 3, similarity: 50, iterations: 3 }, gpu: POINTWISE },
	// odd dimensions, so the clamped border is read on an edge that is not a
	// multiple of anything
	{ filter: 'Bilateral', name: 'odd', input: 'odd', options: { radius: 2, similarity: 60 }, gpu: POINTWISE },
	{ filter: 'DotCrawl', input: 'photo', options: {}, now: 1234, gpu: ACCUMULATING },
	{ filter: 'Glow', input: 'photo', options: { radius: 6 }, gpu: ACCUMULATING },
	// The table is built on the CPU and handed to the shader, so the ramp itself
	// cannot disagree - only which of its 256 entries a pixel lands on, which is
	// a hard boundary and wants the population metric rather than a tolerance.
	{ filter: 'GradientMap', input: 'photo', options: {}, gpu: BOUNDARY },
	{ filter: 'GradientMap', name: 'thermal', input: 'heightmap', options: { ramp: 'thermal' }, gpu: BOUNDARY },
	// banded and rotated: palette cycling, with the clock pinned so it is a still
	{ filter: 'GradientMap', name: 'cycled', input: 'heightmap', now: 2500, options: { ramp: 'spectrum', steps: 6, cycle: 0.25 }, gpu: BOUNDARY },
	{ filter: 'Convolver', input: 'photo', options: {}, gpu: KERNEL },
	{ filter: 'Convolver', name: 'smooth', input: 'photo', options: { preset: 'smooth', iterations: 2 }, gpu: KERNEL },
	{ filter: 'Convolver', name: 'sobel', input: 'photo', options: { preset: 'sobel' }, gpu: KERNEL },
	{ filter: 'Convolver', name: 'laplace', input: 'photo', options: { preset: 'laplace' }, gpu: KERNEL },
	{ filter: 'Convolver', name: 'emboss', input: 'photo', options: { preset: 'emboss' }, gpu: KERNEL },
	{ filter: 'Convolver', name: 'gentle', input: 'photo', options: { preset: 'sharpen', amount: 0.4 }, gpu: KERNEL },
	{ filter: 'Pixelate', input: 'photo', options: { size: 8 }, gpu: POINTWISE },
	// odd dimensions: 33 is not a multiple of 8, so the right column is partial
	{ filter: 'Pixelate', name: 'odd', input: 'odd', options: { size: 8 }, gpu: POINTWISE },
	{ filter: 'Halftone', input: 'photo', options: { spacing: 6 }, gpu: DOTS },
	// newsprint: flat ink, and the rotation switched off so the grid is testable
	{ filter: 'Halftone', name: 'newsprint', input: 'photo', options: { spacing: 8, angle: 0, colour: 'ink' }, gpu: DOTS },
	// dots meeting at the corners on a black ground, so the bright cells are the
	// ones that fill - the opposite assignment to the default
	{ filter: 'Halftone', name: 'wide', input: 'photo', options: { spacing: 10, scale: 1.5, background: 'black' }, gpu: DOTS },
	// odd dimensions, for the same reason Pixelate has the case
	{ filter: 'Halftone', name: 'odd', input: 'odd', options: { spacing: 5 }, gpu: DOTS },
	// four screens 30 degrees apart, mixing subtractively - the print rosette
	{ filter: 'Halftone', name: 'cmyk', input: 'photo', options: { spacing: 8, colour: 'cmyk' }, gpu: DOTS_MULTI },
	// three dots to a cell, added on black - a screen rather than a page
	{ filter: 'Halftone', name: 'rgb', input: 'photo', options: { spacing: 9, angle: 0, scale: 2, colour: 'rgb' }, gpu: DOTS },
	{ filter: 'Dither', input: 'photo', options: {}, gpu: BOUNDARY },
	{ filter: 'Dither', name: 'mono', input: 'photo', options: { monochrome: true, matrix: '4' }, gpu: BOUNDARY },
	{ filter: 'Dither', name: 'levels', input: 'photo', options: { levels: 4, matrix: '2' }, gpu: BOUNDARY },
	// Floyd-Steinberg: sequential, so supportsGPU keeps it off the GPU and the
	// harness records it as CPU-only rather than the case quietly disappearing
	{ filter: 'Dither', name: 'diffusion', input: 'photo', options: { mode: 'diffusion' }, gpu: BOUNDARY },
	// Histogram counts in `prepare` on both backends and the shader only draws
	// the bars, so the numbers cannot disagree - the only thing that could is
	// which pixel a bar's edge lands on, and that would be a hard flip wanting
	// the population metric.
	//
	// It does not happen. Measured, the largest channel delta across all four
	// cases is 1, so no edge moves anywhere and every difference is the blend
	// rounding into a byte - Uint8ClampedArray rounds half to even, the
	// framebuffer conversion rounds half up. Exactly Posteriser-fast's hazard,
	// and a tolerance question rather than a boundary one. The population metric
	// counts a pixel that differs by 1 the same as one that differs by 255, so
	// it was the wrong instrument here and failed these at 2.15% and 6.30%.
	{ filter: 'Histogram', input: 'photo', options: {}, gpu: POINTWISE },
	// the readable version: one curve, on black, filling the frame
	{ filter: 'Histogram', name: 'luma', input: 'photo', options: { mode: 'luma', bins: 128, height: 1, overlay: false }, gpu: POINTWISE },
	// `heightmap` is mostly its flat black background, which is the shape the log
	// scale exists for - see the measurements in the filter's note
	{ filter: 'Histogram', name: 'log', input: 'heightmap', options: { log: true, height: 1, overlay: false }, gpu: POINTWISE },
	// odd dimensions, and 16 bins across 33 columns - the bins do not divide the
	// width, so each bar is a different number of pixels wide
	{ filter: 'Histogram', name: 'odd', input: 'odd', options: { bins: 16, height: 0.5 }, gpu: POINTWISE },
	{ filter: 'Posteriser', input: 'photo', options: { colours: 6 }, gpu: BOUNDARY },
	// The fast method lands on band centres like 21.5, and the two paths break
	// that tie in opposite directions - Uint8ClampedArray rounds half to even,
	// the framebuffer conversion rounds half up. Every pixel is within 1, which
	// is a tolerance question rather than a boundary one.
	{ filter: 'Posteriser', name: 'fast', input: 'photo', options: { method: 'fast', colours: 6 }, gpu: POINTWISE },
	{ filter: 'Morphology', input: 'photo', options: { radius: 2 }, gpu: POINTWISE },
	{ filter: 'Morphology', name: 'erode', input: 'photo', options: { mode: 'erode', radius: 2 }, gpu: POINTWISE },
	// the despeckle DotRemover used to be, on the fixture it was built for
	{ filter: 'Morphology', name: 'open', input: 'binary', options: { mode: 'open' }, gpu: POINTWISE },
	{ filter: 'Morphology', name: 'close', input: 'binary', options: { mode: 'close' }, gpu: POINTWISE },

	// ChromaKey, on `photo`'s sky as a blue screen - the fixture has no green
	// screen in it, but it has something better: a sky that is graded from
	// [93,137,221] to [95,159,198] and is still one colour to a chroma match.
	// The whole sky keys and the whole hill stays, on one tolerance, which is
	// the claim the filter makes about ignoring brightness.
	//
	// POINTWISE rather than the population metric these were expected to want.
	// Measured at tolerance 0, the first, soft and alpha cases are *byte-exact*
	// against the CPU and only spill differs at all - 2 pixels of 3072, by 1.
	// Nothing here flips: RGB is carried through untouched unless spill is on,
	// and the two paths compute one float each for alpha.
	{ filter: 'ChromaKey', input: 'photo', options: { colour: '6691d0', tolerance: 20 }, gpu: POINTWISE },
	// The softness ramp, which the case above cannot reach - the sky and the
	// hill are 61 apart in chroma and its ramp is 30 wide, so every pixel lands
	// at one end or the other. `odd` swings through the whole hue circle, so a
	// wide ramp keyed to one point in it comes out as a chroma-distance field
	// rather than a cut-out, and it brings the not-divisible-by-anything
	// dimensions along with it.
	{ filter: 'ChromaKey', name: 'soft', input: 'odd', options: { colour: 'c04080', tolerance: 40, softness: 120 }, gpu: POINTWISE },
	// Spill suppression, which is the one thing here that writes colour. Same
	// key as the first case, so a break in the keying shows up as this case and
	// that one moving together, and a break in the suppression shows up alone.
	{ filter: 'ChromaKey', name: 'spill', input: 'photo', options: { colour: '6691d0', tolerance: 20, spill: 1 }, gpu: POINTWISE },
	// Alpha in as well as out. The fixture is already graded from transparent to
	// opaque, and the key multiplies rather than assigns, so a pixel that was
	// half there and matches nothing has to come back half there.
	{ filter: 'ChromaKey', name: 'alpha', input: 'alpha', options: { colour: 'e63c50', tolerance: 50 }, gpu: POINTWISE },

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
	{ filter: 'Mirror', input: 'photo', options: { horizontal: true }, gpu: POINTWISE },
	{ filter: 'Mirror', name: 'both-odd', input: 'odd', options: { horizontal: true, vertical: true }, gpu: POINTWISE },
	{ filter: 'Rotator', input: 'photo', options: { turns: 1 }, gpu: POINTWISE },
	{ filter: 'Rotator', name: 'half', input: 'photo', options: { turns: 2 }, gpu: POINTWISE },
	//the two fits only differ on a non-square frame, and the fixture is 4:3
	{ filter: 'Rotator', name: 'crop', input: 'photo', options: { turns: 1, fit: 'crop' }, gpu: POINTWISE },
	{ filter: 'Rotator', name: 'anticlockwise', input: 'photo', options: { turns: 3 }, gpu: POINTWISE },
	// gather with a radial term, so a pixel can land on the other side of a
	// rounding boundary between the backends
	{ filter: 'FishEye', input: 'photo', options: {}, gpu: BOUNDARY },
	{ filter: 'FishEye', name: 'pinch', input: 'photo', options: { amount: -0.4, zoom: 1.2 }, gpu: BOUNDARY },
	{ filter: 'Translator', input: 'photo', options: { horizontal: 0.25, vertical: 0.1 }, gpu: POINTWISE },
	// Scrolling carries the offset past a whole frame, which is where the CPU's
	// single add-or-subtract wrap used to run off the end of the row. The clock
	// is pinned, so this is a still of a moving picture.
	{ filter: 'Translator', name: 'scrolled', input: 'photo', now: 3400, options: { horizontal: 0.25, vertical: 0.1, speed: 1.5 }, gpu: POINTWISE },
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
	{ filter: 'Wave', input: 'photo', options: { axis: 'vertical', amplitude: 5, frequency: 12 }, now: 0, gpu: { mode: 'population', maxDifferentRatio: 0.05 } },
	{ filter: 'Wave', name: 'both', input: 'photo', options: { axis: 'both', amplitude: 4 }, now: 250, gpu: { mode: 'population', maxDifferentRatio: 0.05 } },

	// --- Starters --------------------------------------------------------
	{ filter: 'Fill', input: 'photo', options: { colour: 'c85028' }, gpu: POINTWISE },
	// the same filter reached through the other two spellings, which must land on
	// the identical frame - that equivalence is the whole argument for one filter
	{ filter: 'Fill', name: 'hsv', input: 'photo', options: { hsv: [200, 0.8, 0.9] }, gpu: POINTWISE },
	{ filter: 'Gradient', input: 'photo', options: {}, gpu: POINTWISE },
	{ filter: 'Gradient', name: 'angled', input: 'photo', options: { angle: 35 }, gpu: POINTWISE },
	{ filter: 'Gradient', name: 'radial', input: 'photo', options: { shape: 'radial', start: 255, end: 0 }, gpu: POINTWISE },
	{ filter: 'Voronoi', input: 'photo', options: { cells: 6 }, seed: 5, gpu: ACCUMULATING },
	{ filter: 'Voronoi', name: 'borders', input: 'photo', options: { cells: 6, mode: 'borders' }, seed: 5, gpu: ACCUMULATING },
	// a whole cell flips on a near-tie between two feature points, which a
	// per-channel tolerance cannot describe - see the note at the top
	{ filter: 'Voronoi', name: 'cells', input: 'photo', options: { cells: 6, mode: 'cells' }, seed: 5, gpu: BOUNDARY },
	// Grey out, like every other starter. The `mask` case went with the colour
	// options: it existed to exercise alpha derived from them, and Cloud is now
	// opaque like everything else.
	{ filter: 'Woodgrain', input: 'photo', options: {}, seed: 3, gpu: ACCUMULATING },
	// end grain: stretch 1 is a stump rather than a plank, which is the other half
	// of what the anisotropy does
	{ filter: 'Woodgrain', name: 'endgrain', input: 'photo', options: { stretch: 1, rings: 8, turbulence: 0.4 }, seed: 3, gpu: ACCUMULATING },
	{ filter: 'Cloud', input: 'photo', options: { iterations: 3, initialSize: 4 }, seed: 7, gpu: ACCUMULATING },
	{ filter: 'Cloud', name: 'ridged', input: 'photo', options: { iterations: 5, initialSize: 4, fold: 'ridged' }, seed: 7, gpu: ACCUMULATING },
	{ filter: 'Cloud', name: 'billow', input: 'photo', options: { iterations: 5, initialSize: 4, fold: 'billow' }, seed: 7, gpu: ACCUMULATING },

	// --- Dual input ------------------------------------------------------
	{ filter: 'Blend', input: ['photo', 'second'], options: { ratio: 0.35 }, gpu: POINTWISE },
	{ filter: 'Add', input: ['photo', 'second'], options: {}, gpu: POINTWISE },
	{ filter: 'Subtract', input: ['photo', 'second'], options: {}, gpu: POINTWISE },
	// the point of Difference is the half of the range Subtract clamps to black,
	// so it shares an input pair with Subtract to make the two comparable
	{ filter: 'Difference', input: ['photo', 'second'], options: {}, gpu: POINTWISE },
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
	{ filter: 'ScreenBurn', input: ['clean', 'moved'], sequence: true, options: { decay: 0.75 }, gpu: ACCUMULATING },
	// ScreenBurn reads back its own last output, so a one-step disagreement
	// between the backends is fed into the next frame rather than confined to the
	// one it happened in. Two frames only closes that loop once; this closes it
	// eight times, which is the only way the compounding case can show up.
	{
		filter: 'ScreenBurn',
		name: 'sustained',
		input: ['clean', 'moved', 'clean', 'moved', 'clean', 'moved', 'clean', 'moved'],
		sequence: true,
		options: { decay: 0.95 },
		gpu: ACCUMULATING
	},
	// One bright frame and then darkness, long enough for the trail to be gone.
	// The golden is pure black, so this fails if the burn levels off instead of
	// fading - which is a live risk on the GPU specifically, where the trail is
	// fed back through an 8-bit frame and rounding to nearest leaves every value
	// below about 1/(1-decay) exactly where it stands, for good. The CPU floors,
	// so a GPU that stopped would sit several steps above a black reference and
	// break parity too.
	{
		filter: 'ScreenBurn',
		name: 'toblack',
		input: ['photo', ...Array(60).fill('black')],
		sequence: true,
		options: { decay: 0.9 },
		gpu: ACCUMULATING
	},
	// two unrelated frames is a cut; the same frame twice is not, and both paths
	// matter because the whole filter is that one decision
	{ filter: 'ShotDetector', input: ['clean', 'photo'], sequence: true, options: {}, gpu: POINTWISE },
	{ filter: 'ShotDetector', name: 'nocut', input: ['clean', 'clean'], sequence: true, options: {}, gpu: POINTWISE },

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
