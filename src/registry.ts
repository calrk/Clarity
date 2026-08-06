import type { Filter, FilterOptions } from './core/Filter.js';

import { Add } from './filters/DualInput/Add.js';
import { Subtract } from './filters/DualInput/Subtract.js';
import { Difference } from './filters/DualInput/Difference.js';
import { Blend } from './filters/DualInput/Blend.js';
import { Mask } from './filters/DualInput/Mask.js';
import { Multiply } from './filters/DualInput/Multiply.js';
import { Contourer } from './filters/HeightMap/Contourer.js';
import { NormalFlip } from './filters/HeightMap/NormalFlip.js';
import { NormalGenerator } from './filters/HeightMap/NormalGenerator.js';
import { NormalIntensity } from './filters/HeightMap/NormalIntensity.js';
import { Bleed } from './filters/Process/Bleed.js';
import { Blur } from './filters/Process/Blur.js';
import { Desaturate } from './filters/Process/Desaturate.js';
import { Dither } from './filters/Process/Dither.js';
import { DotCrawl } from './filters/Process/DotCrawl.js';
import { Morphology } from './filters/Process/Morphology.js';
import { Vignette } from './filters/Process/Vignette.js';
import { GradientMap } from './filters/Process/GradientMap.js';
import { Glow } from './filters/Process/Glow.js';
import { Halftone } from './filters/Process/Halftone.js';
import { HanoverBars } from './filters/Process/HanoverBars.js';
import { Invert } from './filters/Process/Invert.js';
import { Levels } from './filters/Process/Levels.js';
import { Noise } from './filters/Process/Noise.js';
import { Pixelate } from './filters/Process/Pixelate.js';
import { Posteriser } from './filters/Process/Posteriser.js';
import { Convolver } from './filters/Process/Convolver.js';
import { hsvShifter } from './filters/Process/hsvShifter.js';
import { EdgeDetector } from './filters/Salience/EdgeDetector.js';
import { MotionDetector } from './filters/Salience/MotionDetector.js';
import { ShotDetector } from './filters/Salience/ShotDetector.js';
import { SkinDetector } from './filters/Salience/SkinDetector.js';
import { Cloud } from './filters/Starters/Cloud.js';
import { Fill } from './filters/Starters/Fill.js';
import { Gradient } from './filters/Starters/Gradient.js';
import { Voronoi } from './filters/Starters/Voronoi.js';
import { Woodgrain } from './filters/Starters/Woodgrain.js';
import { GradientThreshold } from './filters/Thresholders/GradientThreshold.js';
import { MedianThreshold } from './filters/Thresholders/MedianThreshold.js';
import { ValueThreshold } from './filters/Thresholders/ValueThreshold.js';
import { ChromaticAberration } from './filters/Transform/ChromaticAberration.js';
import { Mirror } from './filters/Transform/Mirror.js';
import { Rotator } from './filters/Transform/Rotator.js';
import { Tiler } from './filters/Transform/Tiler.js';
import { FishEye } from './filters/Transform/FishEye.js';
import { Translator } from './filters/Transform/Translator.js';
import { Wave } from './filters/Transform/Wave.js';
import { Brickulate } from './filters/misc/Brickulate.js';
import { DifferenceDetector } from './filters/misc/DifferenceDetector.js';
import { Ghoster } from './filters/misc/Ghoster.js';
import { ScreenBurn } from './filters/misc/ScreenBurn.js';
import { Puzzler } from './filters/misc/Puzzler.js';

/** Anything you can `new` into a filter. */
export type FilterConstructor = (new (options?: FilterOptions) => Filter) & typeof Filter;

/**
 * Every filter, by name.
 *
 * The missing half of {@link CATALOGUE}: that says what each filter *is*, this
 * hands you the class. Anything reconstructing a chain from text - a URL, a
 * saved preset, a `clarity="Blur,radius=8"` attribute - needs to get from a
 * name to a constructor, and doing it by indexing the module namespace object
 * works but is not something a bundler can follow or a type can describe.
 */
export const FILTERS: Record<string, FilterConstructor> = {
	Add,
	Subtract,
	Difference,
	Blend,
	Mask,
	Multiply,
	Contourer,
	NormalFlip,
	NormalGenerator,
	NormalIntensity,
	Bleed,
	Blur,
	Desaturate,
	Dither,
	DotCrawl,
	Morphology,
	Vignette,
	GradientMap,
	Glow,
	Halftone,
	HanoverBars,
	Invert,
	Levels,
	Noise,
	Pixelate,
	Posteriser,
	Convolver,
	hsvShifter,
	EdgeDetector,
	MotionDetector,
	ShotDetector,
	SkinDetector,
	Cloud,
	Fill,
	Gradient,
	Voronoi,
	Woodgrain,
	GradientThreshold,
	MedianThreshold,
	ValueThreshold,
	ChromaticAberration,
	Mirror,
	Rotator,
	Tiler,
	FishEye,
	Translator,
	Wave,
	Brickulate,
	DifferenceDetector,
	Ghoster,
	ScreenBurn,
	Puzzler,
};
