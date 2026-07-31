/**
 * Clarity - canvas image filter library.
 *
 * Every filter is a class with a `process(frame)` method taking and returning
 * ImageData, so they compose into a pipeline by chaining calls.
 */

export { Filter } from './core/Filter.js';
export type { FilterOptions, FilterProperties, Channel } from './core/Filter.js';
export { createImageData, cloneImageData, fillAlpha, setImageDataFactory } from './core/imagedata.js';
export { seededRandom, defaultClock } from './core/random.js';
export type { RandomSource, Clock } from './core/random.js';
export { Operations } from './helpers/Operations.js';
export type { RGB, YUV } from './helpers/Operations.js';
export { Pixel } from './helpers/Pixel.js';
export type { PixelChannel } from './helpers/Pixel.js';
export { CHANNEL_FIELD, coerceValue, defaultsOf } from './core/schema.js';
export type {
	FilterSchema,
	SchemaField,
	NumberField,
	BoolField,
	SelectField,
	SelectOption,
	PropertyValue
} from './core/schema.js';
export { medianCut, nearestColourIndex } from './helpers/quantise.js';
export type { RGBTriplet, MedianCutOptions } from './helpers/quantise.js';

// DualInput
export { Add } from './filters/DualInput/Add.js';
export type { AddOptions } from './filters/DualInput/Add.js';
export { Subtract } from './filters/DualInput/Subtract.js';
export type { SubtractOptions } from './filters/DualInput/Subtract.js';
export { Blend } from './filters/DualInput/Blend.js';
export type { BlendOptions } from './filters/DualInput/Blend.js';
export { Mask } from './filters/DualInput/Mask.js';
export type { MaskOptions } from './filters/DualInput/Mask.js';
export { Multiply } from './filters/DualInput/Multiply.js';
export type { MultiplyOptions } from './filters/DualInput/Multiply.js';

// HeightMap
export { Contourer } from './filters/HeightMap/Contourer.js';
export type { ContourerOptions } from './filters/HeightMap/Contourer.js';
export { NormalFlip } from './filters/HeightMap/NormalFlip.js';
export type { NormalFlipOptions } from './filters/HeightMap/NormalFlip.js';
export { NormalGenerator } from './filters/HeightMap/NormalGenerator.js';
export type { NormalGeneratorOptions } from './filters/HeightMap/NormalGenerator.js';
export { NormalIntensity } from './filters/HeightMap/NormalIntensity.js';
export type { NormalIntensityOptions } from './filters/HeightMap/NormalIntensity.js';

// Process
export { Bleed } from './filters/Process/Bleed.js';
export type { BleedOptions } from './filters/Process/Bleed.js';
export { Blur } from './filters/Process/Blur.js';
export type { BlurOptions } from './filters/Process/Blur.js';
export { Desaturate } from './filters/Process/Desaturate.js';
export type { DesaturateOptions } from './filters/Process/Desaturate.js';
export { DotRemover } from './filters/Process/DotRemover.js';
export type { DotRemoverOptions } from './filters/Process/DotRemover.js';
export { Glow } from './filters/Process/Glow.js';
export type { GlowOptions } from './filters/Process/Glow.js';
export { HanoverBars } from './filters/Process/HanoverBars.js';
export type { HanoverBarsOptions } from './filters/Process/HanoverBars.js';
export { Invert } from './filters/Process/Invert.js';
export type { InvertOptions } from './filters/Process/Invert.js';
export { Noise } from './filters/Process/Noise.js';
export type { NoiseOptions } from './filters/Process/Noise.js';
export { Pixelate } from './filters/Process/Pixelate.js';
export type { PixelateOptions } from './filters/Process/Pixelate.js';
export { Posteriser } from './filters/Process/Posteriser.js';
export type { PosteriserOptions, PosteriserMethod } from './filters/Process/Posteriser.js';
export { Sharpen } from './filters/Process/Sharpen.js';
export type { SharpenOptions } from './filters/Process/Sharpen.js';
export { Smoother } from './filters/Process/Smoother.js';
export type { SmootherOptions } from './filters/Process/Smoother.js';
export { hsvShifter } from './filters/Process/hsvShifter.js';
export type { hsvShifterOptions } from './filters/Process/hsvShifter.js';

// Salience
export { EdgeDetector } from './filters/Salience/EdgeDetector.js';
export type { EdgeDetectorOptions } from './filters/Salience/EdgeDetector.js';
export { MotionDetector } from './filters/Salience/MotionDetector.js';
export type { MotionDetectorOptions } from './filters/Salience/MotionDetector.js';
export { SkinDetector } from './filters/Salience/SkinDetector.js';
export type { SkinDetectorOptions } from './filters/Salience/SkinDetector.js';

// Starters
export { Cloud } from './filters/Starters/Cloud.js';
export type { CloudOptions } from './filters/Starters/Cloud.js';
export { FillHSV } from './filters/Starters/FillHSV.js';
export type { FillHSVOptions } from './filters/Starters/FillHSV.js';
export { FillRGB } from './filters/Starters/FillRGB.js';
export type { FillRGBOptions } from './filters/Starters/FillRGB.js';

// Thresholders
export { GradientThreshold } from './filters/Thresholders/GradientThreshold.js';
export type { GradientThresholdOptions } from './filters/Thresholders/GradientThreshold.js';
export { MedianThreshold } from './filters/Thresholders/MedianThreshold.js';
export type { MedianThresholdOptions } from './filters/Thresholders/MedianThreshold.js';
export { ValueThreshold } from './filters/Thresholders/ValueThreshold.js';
export type { ValueThresholdOptions } from './filters/Thresholders/ValueThreshold.js';

// Transform
export { ChannelSeparate } from './filters/Transform/ChannelSeparate.js';
export type { ChannelSeparateOptions } from './filters/Transform/ChannelSeparate.js';
export { Mirror } from './filters/Transform/Mirror.js';
export type { MirrorOptions } from './filters/Transform/Mirror.js';
export { Rotator } from './filters/Transform/Rotator.js';
export type { RotatorOptions } from './filters/Transform/Rotator.js';
export { Tiler } from './filters/Transform/Tiler.js';
export type { TilerOptions } from './filters/Transform/Tiler.js';
export { Translator } from './filters/Transform/Translator.js';
export type { TranslatorOptions } from './filters/Transform/Translator.js';
export { Wave } from './filters/Transform/Wave.js';
export type { WaveOptions } from './filters/Transform/Wave.js';

// misc
export { Brickulate } from './filters/misc/Brickulate.js';
export type { BrickulateOptions } from './filters/misc/Brickulate.js';
export { DifferenceDetector } from './filters/misc/DifferenceDetector.js';
export type { DifferenceDetectorOptions } from './filters/misc/DifferenceDetector.js';
export { Ghoster } from './filters/misc/Ghoster.js';
export type { GhosterOptions } from './filters/misc/Ghoster.js';
export { Puzzler } from './filters/misc/Puzzler.js';
export type { PuzzlerOptions } from './filters/misc/Puzzler.js';
