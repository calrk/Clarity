import { PRELUDE, PRELUDE_LINES, VERTEX_SHADER } from './glsl.js';
import { createImageData } from '../core/imagedata.js';
import { seedFrom } from '../helpers/hash.js';
import type { Filter } from '../core/Filter.js';
import type { SchemaField } from '../core/schema.js';

/**
 * Prelude uniforms declared as `int` - the sampler bindings and the few counts.
 * Passing a float to an int uniform is an error rather than a coercion, and
 * every generated `u_*` uniform is a float, so the list is fixed and short.
 */
const INT_UNIFORMS = new Set([
	'uSrc', 'uSrc2', 'uReduce', 'uOriginal', 'uData', 'uHistory',
	'uChannel', 'uHistoryHead', 'uHistoryCount', 'uHistoryLength'
]);

/** One render target: a texture, and the framebuffer that draws into it. */
interface Target {
	texture: WebGLTexture;
	framebuffer: WebGLFramebuffer;
	width: number;
	height: number;
}

/**
 * Halves a reduction target, keeping the smallest red and the largest green of
 * each 2x2 block.
 *
 * Run repeatedly this collapses the frame to a single texel holding its minimum
 * and maximum - the standard pyramid reduction. A fragment shader cannot loop
 * over an image, but it can look at four pixels, and doing that log2(size)
 * times gets to the same answer in about a dozen draws.
 */
export const REDUCE_STEP = /* glsl */ `
void main(){
	ivec2 limit = ivec2(uSize) - 1;
	ivec2 p = outPixel() * 2;

	vec4 a = texelFetch(uSrc, min(p,                 limit), 0);
	vec4 b = texelFetch(uSrc, min(p + ivec2(1, 0),   limit), 0);
	vec4 c = texelFetch(uSrc, min(p + ivec2(0, 1),   limit), 0);
	vec4 d = texelFetch(uSrc, min(p + ivec2(1, 1),   limit), 0);

	//an odd size makes the clamp re-read a pixel that is already in the block,
	//which is harmless for a min or a max
	fragColor = vec4(
		min(min(a.r, b.r), min(c.r, d.r)),
		max(max(a.g, b.g), max(c.g, d.g)),
		0.0,
		1.0
	);
}
`;

/** A single draw. Most filters are one; Blur is two, Glow three. */
export interface ShaderPass {
	/** GLSL body. Compiled against the prelude in `glsl.ts`. */
	source: string;
	/**
	 * GLSL that seeds a whole-image reduction, run before this pass.
	 *
	 * It maps each source pixel to the quantity being reduced, writing it into
	 * red (for the minimum) and green (for the maximum). The result collapses to
	 * one texel that the pass reads with `reduction()`.
	 */
	reduce?: string;
	/** Extra uniforms for this pass, on top of the ones from the schema. */
	uniforms?: Record<string, number | number[]>;
	/**
	 * Number of times to repeat this pass, ping-ponging between targets.
	 * A function so it can depend on a property - Smoother's `iterations`.
	 */
	repeat?: (filter: Filter) => number;
}

/** What a filter declares to be runnable on the GPU. */
export type ShaderDefinition = string | ShaderPass[];

/**
 * Per-instance data that will not fit in a uniform, uploaded as a small RGBA8
 * texture and read in the shader with `dataValue(x, y)`.
 *
 * A uniform is a scalar, and some filters carry an array: Puzzler's tile
 * shuffle is a grid of source indices that changes on a click as well as on a
 * property change. `bytes` is RGBA, four per texel.
 */
export interface FilterData {
	width: number;
	height: number;
	bytes: Uint8Array;
}

/** What a stateful filter needs kept for it. See `Filter.retains`. */
export interface RetainedFrames {
	/** How many frames the shader can reach back through, including this one. */
	length: number;
	/**
	 * `ring` keeps the last `length` frames, overwriting the oldest.
	 * `first` captures one frame and holds it - DifferenceDetector's reference.
	 */
	mode?: 'ring' | 'first';
}

/** One filter's retained frames: a texture array and where the newest is. */
export interface History {
	texture: WebGLTexture;
	framebuffer: WebGLFramebuffer;
	width: number;
	height: number;
	length: number;
	/** Layer holding the newest frame. */
	head: number;
	/** How many layers have been written, up to `length`. */
	count: number;
	/**
	 * How many had been written *before* this frame's push - which is what the
	 * shader is given as `uHistoryCount`.
	 *
	 * The CPU implementations all decide what to do based on how much history
	 * they had when the frame arrived, and the push has already happened by the
	 * time the shader runs, so the post-push count would be one frame ahead of
	 * every comparison they make.
	 */
	before: number;
	/** The filter's `historyEpoch` when this was built. */
	epoch: number;
}

/**
 * Copies a texture verbatim, for stashing a filter's input where its later
 * passes can still reach it. `texelFetch` rather than a 0-255 round trip, so
 * the copy is bit-identical.
 */
export const COPY_PASS = /* glsl */ `
void main(){
	fragColor = texelFetch(uSrc, outPixel(), 0);
}
`;

/**
 * WebGL2 executor for the filter chain.
 *
 * Owns one context, a program cache and a pool of render targets, and
 * ping-pongs between two of them so an N-filter chain is N draw calls with no
 * CPU round-trip in between. That round-trip is where the cost actually lives:
 * a 1080p `getImageData`/`putImageData` pair per filter dwarfs the arithmetic.
 *
 * Creating one can fail - no WebGL2, a lost context, a blocked GPU - so
 * everything goes through {@link create}, which returns null rather than
 * throwing. Callers fall back to the CPU path.
 */
export class GLBackend {
	private gl: WebGL2RenderingContext;
	private canvas: HTMLCanvasElement | OffscreenCanvas;
	private programs = new Map<string, WebGLProgram>();
	private uniformCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
	private targets: Target[] = [];
	private sourceTexture: WebGLTexture | null = null;
	private extraTexture: WebGLTexture | null = null;
	private dataTexture: WebGLTexture | null = null;
	private histories = new Map<Filter, History>();
	private blankArray: WebGLTexture | null = null;
	private readBuffer: Uint8Array | undefined;

	/** Shaders that failed to compile, so a broken filter is reported once. */
	readonly failures = new Map<string, string>();

	private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement | OffscreenCanvas) {
		this.gl = gl;
		this.canvas = canvas;
	}

	/** Returns null when WebGL2 is unavailable, rather than throwing. */
	static create(canvas?: HTMLCanvasElement | OffscreenCanvas): GLBackend | null {
		try {
			const target = canvas ?? makeCanvas();
			if (!target) {
				return null;
			}

			const gl = target.getContext('webgl2', {
				alpha: true,
				antialias: false,
				depth: false,
				stencil: false,
				premultipliedAlpha: false,
				preserveDrawingBuffer: false
			}) as WebGL2RenderingContext | null;

			if (!gl) {
				return null;
			}
			return new GLBackend(gl, target);
		} catch {
			return null;
		}
	}

	get context(): WebGL2RenderingContext {
		return this.gl;
	}

	get lost(): boolean {
		return this.gl.isContextLost();
	}

	// --- programs -----------------------------------------------------------

	/**
	 * Compiles a filter shader, or returns null and records why.
	 *
	 * Cached on the source text, so the twenty filters that share the 3x3 kernel
	 * template compile it once and a filter re-added to the chain costs nothing.
	 */
	program(source: string, label: string): WebGLProgram | null {
		const cached = this.programs.get(source);
		if (cached) {
			return cached;
		}
		if (this.failures.has(source)) {
			return null;
		}

		const gl = this.gl;
		const vertex = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER, label);
		const fragment = this.compile(gl.FRAGMENT_SHADER, PRELUDE + source, label);
		if (!vertex || !fragment) {
			return null;
		}

		const program = gl.createProgram();
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			this.failures.set(source, `${label}: ${gl.getProgramInfoLog(program) ?? 'link failed'}`);
			gl.deleteProgram(program);
			return null;
		}

		this.programs.set(source, program);
		return program;
	}

	private compile(type: number, source: string, label: string): WebGLShader | null {
		const gl = this.gl;
		const shader = gl.createShader(type);
		if (!shader) {
			return null;
		}

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(shader) ?? 'compile failed';
			//Errors come back numbered against the concatenated source, which is
			//meaningless to whoever wrote the filter - shift them back onto their
			//own file.
			const shifted = log.replace(/ERROR: (\d+):(\d+)/g, (_all, column, line) => {
				const own = Number(line) - PRELUDE_LINES + 1;
				return `ERROR: ${column}:${own}`;
			});
			this.failures.set(source.slice(PRELUDE.length), `${label}: ${shifted}`);
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	// --- textures and targets -----------------------------------------------

	/** Uploads a frame, reusing the same texture object between calls. */
	upload(frame: ImageData): WebGLTexture {
		this.sourceTexture ??= this.makeTexture();
		this.write(this.sourceTexture, frame);
		return this.sourceTexture;
	}

	/**
	 * Uploads the second frame of a two-input filter.
	 *
	 * A separate texture rather than a second call to `upload`, which reuses one
	 * object and would overwrite the first input with the second.
	 */
	uploadSecond(frame: ImageData): WebGLTexture {
		this.extraTexture ??= this.makeTexture();
		this.write(this.extraTexture, frame);
		return this.extraTexture;
	}

	get secondTexture(): WebGLTexture | null {
		return this.extraTexture;
	}

	/**
	 * Uploads a filter's per-instance data - see `Filter.data`.
	 *
	 * Its own texture rather than a slot in the pool: the pool holds render
	 * targets sized to the frame, and this is a handful of bytes that has nothing
	 * to do with the frame's shape.
	 */
	uploadData(data: FilterData): WebGLTexture {
		const gl = this.gl;
		this.dataTexture ??= this.makeTexture();

		gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
		gl.texImage2D(
			gl.TEXTURE_2D, 0, gl.RGBA, data.width, data.height, 0,
			gl.RGBA, gl.UNSIGNED_BYTE, data.bytes
		);
		return this.dataTexture;
	}

	private write(texture: WebGLTexture, frame: ImageData): void {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			frame.width,
			frame.height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.length)
		);
	}

	// --- retained frames ------------------------------------------------------

	/**
	 * The retained frames held for a filter, built or rebuilt as needed.
	 *
	 * A texture array rather than N textures: Ghoster reaches back thirty frames,
	 * and thirty samplers is past what a fragment shader is guaranteed to have.
	 * Rebuilt when the frame size changes or when the filter's `historyEpoch`
	 * moves, which is how `Filter.reset` reaches storage it cannot see.
	 */
	history(filter: Filter, spec: RetainedFrames, width: number, height: number): History {
		const gl = this.gl;
		const length = Math.max(1, spec.length);
		const existing = this.histories.get(filter);

		if (
			existing &&
			existing.width === width &&
			existing.height === height &&
			existing.length === length &&
			existing.epoch === filter.historyEpoch
		) {
			return existing;
		}

		if (existing) {
			gl.deleteFramebuffer(existing.framebuffer);
			gl.deleteTexture(existing.texture);
		}

		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
		gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, length);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		const built: History = {
			texture,
			framebuffer: gl.createFramebuffer(),
			width,
			height,
			length,
			//so the first push lands on layer 0, matching the CPU's ring
			head: length - 1,
			count: 0,
			before: 0,
			epoch: filter.historyEpoch
		};
		this.histories.set(filter, built);
		return built;
	}

	/** Copies a frame into one layer of a history, as the newest. */
	pushHistory(history: History, source: WebGLTexture): void {
		const gl = this.gl;
		const program = this.program(COPY_PASS, 'history');
		if (!program) {
			return;
		}

		history.head = (history.head + 1) % history.length;
		history.count = Math.min(history.count + 1, history.length);

		gl.bindFramebuffer(gl.FRAMEBUFFER, history.framebuffer);
		gl.framebufferTextureLayer(
			gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, history.texture, 0, history.head
		);

		this.draw({
			program,
			source,
			into: { texture: history.texture, framebuffer: history.framebuffer, width: history.width, height: history.height },
			width: history.width,
			height: history.height,
			sourceWidth: history.width,
			sourceHeight: history.height,
			uniforms: {}
		});
	}

	/**
	 * A 1x1x1 array texture, bound whenever a shader has no history of its own.
	 *
	 * `uHistory` is declared in the prelude, so it exists in every program even
	 * though almost nothing samples it. Leaving its unit with no array texture
	 * bound is the kind of thing that works everywhere until it does not.
	 */
	private blankHistory(): WebGLTexture {
		const gl = this.gl;
		if (!this.blankArray) {
			this.blankArray = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blankArray);
			gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 1);
			gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		}
		return this.blankArray;
	}

	/** Reads a target back into an ImageData. */
	download(target: Target): ImageData {
		const gl = this.gl;
		const size = target.width * target.height * 4;

		if (!this.readBuffer || this.readBuffer.length < size) {
			this.readBuffer = new Uint8Array(size);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
		gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, this.readBuffer);

		//No vertical flip, anywhere. GL conventionally treats row 0 as the bottom
		//and ImageData treats it as the top, so the tempting move is to flip on
		//upload and flip back on download - but that leaves `gl_FragCoord.y`
		//counting from the bottom while every CPU filter counts rows from the top,
		//and any filter that cares about its row index (HanoverBars, Brickulate)
		//silently disagrees with its CPU twin.
		//
		//Uploading unflipped and reading back unflipped is self-consistent
		//instead: texture row 0, framebuffer row 0 and ImageData row 0 are all the
		//same row, so a shader's pixel coordinates mean what a filter author
		//expects. The only place the convention shows is drawing to a visible
		//canvas, which has to flip in the vertex stage.
		const frame = createImageData(target.width, target.height);
		frame.data.set(this.readBuffer.subarray(0, target.width * target.height * 4));
		return frame;
	}

	private makeTexture(): WebGLTexture {
		const gl = this.gl;
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		//NEAREST throughout: every filter here samples exact texels, and linear
		//filtering would quietly blend neighbours into results the CPU computes
		//exactly.
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return texture;
	}

	/** A render target of the given size, from the pool. */
	target(index: number, width: number, height: number): Target {
		const gl = this.gl;
		let existing = this.targets[index];

		if (!existing) {
			const texture = this.makeTexture();
			const framebuffer = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			existing = { texture, framebuffer, width: 0, height: 0 };
			this.targets[index] = existing;
		}

		if (existing.width !== width || existing.height !== height) {
			gl.bindTexture(gl.TEXTURE_2D, existing.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			existing.width = width;
			existing.height = height;
		}

		return existing;
	}

	// --- drawing ------------------------------------------------------------

	/**
	 * Draws one pass.
	 *
	 * `into` being null renders to the default framebuffer, which is how the
	 * final stage reaches a visible canvas without a readback.
	 */
	draw(options: {
		program: WebGLProgram;
		source: WebGLTexture;
		second?: WebGLTexture | null;
		/** 1x1 reduction result, bound to uReduce. */
		reduce?: WebGLTexture | null;
		/** The stage's input, bound to uOriginal for a filter that asked for it. */
		original?: WebGLTexture | null;
		/** Per-instance data, bound to uData. */
		data?: WebGLTexture | null;
		/** Retained frames, bound to uHistory. */
		history?: History | null;
		into: Target | null;
		width: number;
		height: number;
		sourceWidth: number;
		sourceHeight: number;
		uniforms: Record<string, number | number[]>;
	}): void {
		const gl = this.gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, options.into ? options.into.framebuffer : null);
		gl.viewport(0, 0, options.width, options.height);
		gl.useProgram(options.program);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, options.source);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, options.second ?? options.source);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, options.reduce ?? options.source);
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, options.original ?? options.source);
		gl.activeTexture(gl.TEXTURE4);
		gl.bindTexture(gl.TEXTURE_2D, options.data ?? options.source);
		gl.activeTexture(gl.TEXTURE5);
		gl.bindTexture(gl.TEXTURE_2D_ARRAY, options.history?.texture ?? this.blankHistory());
		gl.activeTexture(gl.TEXTURE0);

		this.setUniform(options.program, 'uSrc', 0);
		this.setUniform(options.program, 'uSrc2', 1);
		this.setUniform(options.program, 'uReduce', 2);
		this.setUniform(options.program, 'uOriginal', 3);
		this.setUniform(options.program, 'uData', 4);
		this.setUniform(options.program, 'uHistory', 5);
		this.setUniform(options.program, 'uHistoryHead', options.history?.head ?? 0);
		this.setUniform(options.program, 'uHistoryCount', options.history?.before ?? 0);
		this.setUniform(options.program, 'uHistoryLength', options.history?.length ?? 1);
		this.setUniform(options.program, 'uSize', [options.sourceWidth, options.sourceHeight]);
		this.setUniform(options.program, 'uTexel', [1 / options.sourceWidth, 1 / options.sourceHeight]);
		this.setUniform(options.program, 'uOutSize', [options.width, options.height]);

		for (const [name, value] of Object.entries(options.uniforms)) {
			this.setUniform(options.program, name, value);
		}

		//A single oversized triangle rather than two triangles: no vertex buffer,
		//no attribute state, and no seam down the diagonal.
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	private setUniform(program: WebGLProgram, name: string, value: number | number[]): void {
		const gl = this.gl;
		let locations = this.uniformCache.get(program);
		if (!locations) {
			locations = new Map();
			this.uniformCache.set(program, locations);
		}
		if (!locations.has(name)) {
			locations.set(name, gl.getUniformLocation(program, name));
		}

		const location = locations.get(name);
		if (!location) {
			return;	//optimised out because the shader does not use it
		}

		if (typeof value === 'number') {
			if (INT_UNIFORMS.has(name)) {
				gl.uniform1i(location, value);
			} else {
				gl.uniform1f(location, value);
			}
			return;
		}

		if (value.length === 2) gl.uniform2fv(location, value);
		else if (value.length === 3) gl.uniform3fv(location, value);
		else if (value.length === 4) gl.uniform4fv(location, value);
		else gl.uniform1fv(location, value);
	}

	resizeCanvas(width: number, height: number): void {
		if (this.canvas.width !== width || this.canvas.height !== height) {
			this.canvas.width = width;
			this.canvas.height = height;
		}
	}

	dispose(): void {
		const gl = this.gl;
		//The pool is sparse - the reduction owns high slots the chain never
		//touches - and `for...of` walks holes as undefined rather than skipping
		//them, so the gaps have to be filtered out explicitly.
		for (const target of this.targets) {
			if (!target) {
				continue;
			}
			gl.deleteFramebuffer(target.framebuffer);
			gl.deleteTexture(target.texture);
		}
		for (const program of this.programs.values()) {
			gl.deleteProgram(program);
		}
		for (const history of this.histories.values()) {
			gl.deleteFramebuffer(history.framebuffer);
			gl.deleteTexture(history.texture);
		}
		for (const texture of [this.sourceTexture, this.extraTexture, this.dataTexture, this.blankArray]) {
			if (texture) {
				gl.deleteTexture(texture);
			}
		}
		this.targets = [];
		this.programs.clear();
		this.histories.clear();
		this.sourceTexture = null;
		this.extraTexture = null;
		this.dataTexture = null;
		this.blankArray = null;
	}
}

export type { Target };

/**
 * Uniform values for a filter, taken from its schema.
 *
 * The schema is what makes this generated rather than hand-written per filter:
 * it already says a property is an int, a float, a bool or one of a fixed set
 * of strings, which is exactly what decides how it crosses into GLSL. Names are
 * prefixed because several property names - `length`, `fixed`, `sample` - are
 * reserved words or builtins in GLSL and would fail to compile bare.
 */
export function uniformsFor(filter: Filter): Record<string, number | number[]> {
	const uniforms: Record<string, number | number[]> = {
		uTime: filter.now(),
		uChannel: channelIndex(filter.channel)
	};

	//One draw per stage per frame, which is exactly what the CPU implementations
	//take - so a seeded source produces the same frame on both backends. Only
	//for `varying` filters, so nothing else quietly advances its own stream.
	if ((filter.constructor as typeof Filter).varying) {
		uniforms.uSeed = seedFrom(filter.random);
	}

	const schema = filter.schema;
	for (const [key, field] of Object.entries(schema)) {
		if (key === 'channel') {
			continue;	//already carried by uChannel
		}
		const value = filter.getProperty(key);
		uniforms[`u_${key}`] = encode(field, value);
		//`null` is meaningful for a nullable field - a separate flag rather than a
		//sentinel value, so a shader can branch on it without guessing
		if (field.type !== 'bool' && field.type !== 'select' && field.nullable) {
			uniforms[`u_${key}_auto`] = value === null ? 1 : 0;
		}
	}

	return uniforms;
}

function encode(field: SchemaField, value: unknown): number {
	if (field.type === 'bool') {
		return value ? 1 : 0;
	}
	if (field.type === 'select') {
		//index into the declared options, so a shader compares against a number
		const index = field.options.findIndex((option) => option.value === value);
		return index < 0 ? 0 : index;
	}
	return typeof value === 'number' ? value : 0;
}

export function channelIndex(channel: string): number {
	switch (channel) {
		case 'red':
		case 'r':
			return 1;
		case 'green':
		case 'g':
			return 2;
		case 'blue':
		case 'b':
			return 3;
		default:
			return 0;
	}
}

function makeCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
	if (typeof OffscreenCanvas !== 'undefined') {
		return new OffscreenCanvas(1, 1);
	}
	if (typeof document !== 'undefined') {
		return document.createElement('canvas');
	}
	return null;
}
