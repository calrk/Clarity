import { PRELUDE, PRELUDE_LINES, VERTEX_SHADER } from './glsl.js';
import { createImageData } from '../core/imagedata.js';
import type { Filter } from '../core/Filter.js';
import type { SchemaField } from '../core/schema.js';

/** One render target: a texture, and the framebuffer that draws into it. */
interface Target {
	texture: WebGLTexture;
	framebuffer: WebGLFramebuffer;
	width: number;
	height: number;
}

/** A single draw. Most filters are one; Blur is two, Glow three. */
export interface ShaderPass {
	/** GLSL body. Compiled against the prelude in `glsl.ts`. */
	source: string;
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

const MAX_TEXTURE_UNITS = 2;

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

		this.setUniform(options.program, 'uSrc', 0);
		this.setUniform(options.program, 'uSrc2', 1);
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
			//Sampler bindings and anything declared `int` in the prelude have to go
			//through uniform1i - passing a float to an int uniform is an error, not
			//a coercion. Every generated `u_*` uniform is declared float, so the
			//list of exceptions is fixed and short.
			if (name === 'uSrc' || name === 'uSrc2' || name === 'uChannel') {
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
		for (const target of this.targets) {
			gl.deleteFramebuffer(target.framebuffer);
			gl.deleteTexture(target.texture);
		}
		for (const program of this.programs.values()) {
			gl.deleteProgram(program);
		}
		if (this.sourceTexture) {
			gl.deleteTexture(this.sourceTexture);
		}
		this.targets = [];
		this.programs.clear();
		this.sourceTexture = null;
	}
}

export type { Target };
export { MAX_TEXTURE_UNITS };

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
