/**
 * The GLSL every filter shader is compiled against.
 *
 * Filters supply a `main()` and nothing else. Everything they need to read -
 * the source texture, the frame size, the channel selector, one uniform per
 * declared property - is provided here, so a filter shader is the *body* of the
 * operation rather than a file of boilerplate.
 *
 * Colours are handled in **0-255 space**, not 0-1. The CPU implementations
 * threshold, band and compare against byte values, and doing the same on the
 * GPU means the two read alike and the parity tests compare like with like. The
 * conversion happens at the sampler and at the output, in `srcPixel` and
 * `writePixel`.
 */

export const VERTEX_SHADER = `#version 300 es
precision highp float;

// one full-screen triangle, generated from gl_VertexID - no buffers, no VAO
// attributes, nothing to bind per draw
out vec2 vUv;

void main(){
	vec2 corner = vec2(
		float((gl_VertexID & 1) << 2),
		float((gl_VertexID & 2) << 1)
	);
	vUv = corner * 0.5;
	gl_Position = vec4(corner - 1.0, 0.0, 1.0);
}
`;

/** Prepended to every filter shader. */
export const PRELUDE = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

/** The frame coming in. */
uniform sampler2D uSrc;
/** Second frame, for the two-input filters. Bound to uSrc when unused. */
uniform sampler2D uSrc2;

/**
 * A 1x1 texture holding the result of a whole-image reduction, for the filters
 * that need to know something about the frame before they can process a pixel.
 * Red is the minimum, green the maximum. Only bound when the filter declared a
 * 'reduce' pass; see reduction() below.
 */
uniform sampler2D uReduce;

/**
 * The frame as it entered this filter, for a multi-pass filter whose last pass
 * needs to combine its own working with what it started from - Glow adds a blur
 * back onto the original, Bleed keeps the original's luma.
 *
 * By that point uSrc is the previous pass's output, and the input texture has
 * usually been recycled as a ping-pong target, so the executor copies it aside
 * before the first pass. Bound to uSrc when no pass mentions it, so reading it
 * from a single-pass filter is a no-op rather than a black frame.
 */
uniform sampler2D uOriginal;

/**
 * Per-instance data a filter cannot express as a uniform, because it is an
 * array rather than a scalar - Puzzler's tile shuffle. Supplied by a filter's
 * static data(), and read with dataTexel/dataValue below.
 */
uniform sampler2D uData;
/** Size of uData, or (0, 0) when the filter supplied none. */
uniform vec2 uDataSize;

/**
 * Frames this filter has already seen, for the stateful ones - Ghoster's trail,
 * MotionDetector's ring, DifferenceDetector's reference frame. Supplied when a
 * filter declares static retains(); read with historyTexel below.
 */
uniform highp sampler2DArray uHistory;
/** Layer holding the newest frame, and the ring size. */
uniform int uHistoryHead;
uniform int uHistoryLength;
/**
 * How many frames had been retained *before* this one arrived.
 *
 * The push happens before the shader runs, so the post-push count would be a
 * frame ahead of every test the CPU implementations make - they all decide
 * what to do from how much history they had when the frame turned up.
 */
uniform int uHistoryCount;

/** Size of the input in pixels, and its reciprocal. */
uniform vec2 uSize;
uniform vec2 uTexel;
/** Size of what is being rendered into, which a filter may change. */
uniform vec2 uOutSize;
/** Milliseconds, from the filter's injected clock. */
uniform float uTime;
/**
 * One draw from the filter's random source, for the hashed randomness below.
 * Only supplied to a filter declaring itself 'varying', since those are the
 * only ones that should be consuming the stream.
 */
uniform float uSeed;
/** Channel selector: 0 grey, 1 red, 2 green, 3 blue. */
uniform int uChannel;

const vec3 LUMA = vec3(299.0, 587.0, 114.0) / 1000.0;

/** Sample in 0-255 space, which is what the CPU implementations work in. */
vec4 srcPixel(vec2 uv){
	return texture(uSrc, uv) * 255.0;
}

vec4 src2Pixel(vec2 uv){
	return texture(uSrc2, uv) * 255.0;
}

/** One texel of the filter's data texture, as whole numbers 0-255. */
vec4 dataTexel(int x, int y){
	vec4 raw = texelFetch(uData, ivec2(x, y), 0) * 255.0;
	return floor(raw + 0.5);
}

/** Its red channel, which is where a single value per texel goes. */
float dataValue(int x, int y){
	return dataTexel(x, y).r;
}

/**
 * A retained frame, by age: 0 is the one being processed, 1 the one before it.
 * In 0-255, and clamped to the frame like srcTexel.
 */
vec4 historyTexel(int age, ivec2 pixel){
	//the ring wraps backwards, so a plain % would give a negative layer
	int layer = uHistoryHead - age;
	layer = ((layer % uHistoryLength) + uHistoryLength) % uHistoryLength;
	ivec2 clamped = clamp(pixel, ivec2(0), ivec2(uSize) - 1);
	return texelFetch(uHistory, ivec3(clamped, layer), 0) * 255.0;
}

/** The frame as it entered this filter. See uOriginal. */
vec4 originalPixel(vec2 uv){
	return texture(uOriginal, uv) * 255.0;
}

vec4 originalTexel(ivec2 pixel){
	ivec2 clamped = clamp(pixel, ivec2(0), ivec2(uSize) - 1);
	return texelFetch(uOriginal, clamped, 0) * 255.0;
}

/** Sample by integer pixel coordinate, clamped to the frame. */
vec4 srcTexel(ivec2 pixel){
	ivec2 clamped = clamp(pixel, ivec2(0), ivec2(uSize) - 1);
	return texelFetch(uSrc, clamped, 0) * 255.0;
}

/** This fragment's pixel coordinate in the output. */
ivec2 outPixel(){
	return ivec2(gl_FragCoord.xy);
}

/**
 * Rec. 601 luma, matching Filter.getColourValue. The weights are scaled by
 * 1000 there so they sum to exactly 1; the same constant is used here so a
 * neutral grey reads back as itself on both paths.
 */
float luma(vec4 colour){
	return dot(colour.rgb, LUMA);
}

/** Honours the filter's 'channel' option, like getColourValue does. */
float channelValue(vec4 colour){
	if(uChannel == 1) return colour.r;
	if(uChannel == 2) return colour.g;
	if(uChannel == 3) return colour.b;
	return luma(colour);
}

/** Writes a 0-255 colour back out. */
void writePixel(vec4 colour){
	fragColor = colour / 255.0;
}

void writeRGB(vec3 colour){
	fragColor = vec4(colour / 255.0, 1.0);
}

/**
 * The frame's minimum and maximum, in 0-255, as (x, y).
 *
 * Computed by a pyramid of halving passes before the filter runs, so this is a
 * single texel fetch rather than a loop over the image.
 */
vec2 reduction(){
	return texelFetch(uReduce, ivec2(0), 0).rg * 255.0;
}

// --- hashed randomness ----------------------------------------------------
//
// The twin of src/helpers/hash.ts, which carries the explanation. Both are
// 32-bit integer arithmetic so the two agree exactly; keep them in step.

uint hash32(uint h){
	h ^= h >> 16;
	h *= 0x7feb352du;
	h ^= h >> 15;
	h *= 0x846ca68bu;
	h ^= h >> 16;
	return h;
}

uint hashMix(int x, int y, int lane, float seed){
	return uint(x) * 0x9e3779b9u
		^ uint(y) * 0x85ebca6bu
		^ uint(lane + 1) * 0xc2b2ae35u
		^ uint(seed);
}

/** 0-1, uniform. 24 bits, which is what a float32 holds exactly. */
float hashedRandom(int x, int y, int lane, float seed){
	return float(hash32(hashMix(x, y, lane, seed)) >> 8) / 16777216.0;
}

/** 0-255, uniform - the top byte, so no float is involved at all. */
float hashedByte(int x, int y, int lane, float seed){
	return float(hash32(hashMix(x, y, lane, seed)) >> 24);
}

/** Uint8ClampedArray rounding, which is what every CPU write goes through. */
float toByte(float v){
	return clamp(floor(v + 0.5), 0.0, 255.0);
}

vec3 toByte3(vec3 v){
	return vec3(toByte(v.r), toByte(v.g), toByte(v.b));
}

// --- colour space helpers -------------------------------------------------
//
// Transcribed from src/helpers/Operations.ts rather than written from a
// reference, quirks included, because the point is to agree with the CPU path
// pixel for pixel - not to be independently correct. Where the CPU has an odd
// sign or an unusual formulation, so does this.

/** Hue in degrees, saturation and value in 0-1, from a 0-255 RGB. */
vec3 rgb2hsv(vec3 rgb){
	vec3 n = rgb / 255.0;
	float minC = min(n.r, min(n.g, n.b));
	float maxC = max(n.r, max(n.g, n.b));

	if(minC == maxC){
		return vec3(0.0, 0.0, minC);
	}

	float d = (n.r == minC) ? n.g - n.b : ((n.b == minC) ? n.r - n.g : n.b - n.r);
	float h = (n.r == minC) ? 3.0 : ((n.b == minC) ? 1.0 : 5.0);

	return vec3(
		60.0 * (h - d / (maxC - minC)),
		(maxC - minC) / maxC,
		maxC
	);
}

/** Back to 0-255 RGB. */
vec3 hsv2rgb(vec3 hsv){
	float sector = hsv.x / 60.0;
	float c = hsv.z * hsv.y;
	float x = c * (1.0 - abs(mod(sector, 2.0) - 1.0));
	float m = hsv.z - c;

	int which = int(floor(sector));
	vec3 rgb;
	if(which == 1)      rgb = vec3(x, c, 0.0);
	else if(which == 2) rgb = vec3(0.0, c, x);
	else if(which == 3) rgb = vec3(0.0, x, c);
	else if(which == 4) rgb = vec3(x, 0.0, c);
	// 0 and 6 share a case on the CPU, and anything else falls to the same
	// default it does
	else                rgb = vec3(c, 0.0, x);
	if(which == 0 || which == 6) rgb = vec3(c, x, 0.0);

	return (rgb + m) * 255.0;
}

/** Operations.RGBtoYUV - takes 0-255, returns the same scale it does. */
vec3 rgb2yuv(vec3 rgb){
	return vec3(
		 0.299   * rgb.r + 0.587   * rgb.g + 0.114   * rgb.b,
		-0.14713 * rgb.r - 0.28886 * rgb.g + 0.436   * rgb.b,
		 0.615   * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b
	);
}

/** Operations.YUVtoRGB. */
vec3 yuv2rgb(vec3 yuv){
	return vec3(
		yuv.x + 1.13983 * yuv.z,
		yuv.x - 0.39465 * yuv.y - 0.5806 * yuv.z,
		yuv.x + 2.03211 * yuv.y
	);
}

/** SkinDetector's integer BT.601 YCbCr, including its rounding to bytes. */
vec3 rgb2ycbcr(vec3 rgb){
	return toByte3(vec3(
		 16.0 + ( 66.0 * rgb.r + 129.0 * rgb.g +  25.0 * rgb.b) / 256.0,
		128.0 + (-38.0 * rgb.r -  74.0 * rgb.g + 112.0 * rgb.b) / 256.0,
		128.0 + (112.0 * rgb.r -  94.0 * rgb.g -  18.0 * rgb.b) / 256.0
	));
}
`;

/** Line count of the prelude, so compile errors can be reported against the filter's own source. */
export const PRELUDE_LINES = PRELUDE.split('\n').length;
