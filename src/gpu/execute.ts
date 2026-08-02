import { GLBackend, COPY_PASS, REDUCE_STEP, uniformsFor } from './GLBackend.js';
import type { ShaderPass, Target } from './GLBackend.js';
import type { Filter } from '../core/Filter.js';

/** One stage of a chain, as the executor sees it. */
export interface GPUStage {
	filter: Filter;
	second?: ImageData;
}

export interface ExecuteResult {
	frame: ImageData;
	/** Indices that ran on the GPU. */
	onGPU: number[];
	/** Indices that fell back to the CPU, and why. */
	fallbacks: { index: number; filter: string; reason: string }[];
	/** How many times the frame crossed the CPU/GPU boundary. */
	transfers: number;
}

/** The passes a filter needs, normalised from its `shader` declaration. */
export function passesOf(filter: Filter): ShaderPass[] | null {
	const shader = (filter.constructor as typeof Filter).shader;
	if (!shader) {
		return null;
	}
	return typeof shader === 'string' ? [{ source: shader }] : shader;
}

/** Whether a filter can run on the GPU *with its current properties*. */
export function canRunOnGPU(filter: Filter): boolean {
	const type = filter.constructor as typeof Filter;
	return type.shader !== null && type.supportsGPU(filter);
}

/**
 * Runs a chain, using the GPU for every stage that can and the CPU for the
 * rest.
 *
 * Mixing the two is the point. A chain is rarely all-or-nothing - one
 * histogram-shaped filter in the middle of nine pointwise ones should not
 * force the other nine back onto the CPU - so the frame is kept on whichever
 * side it was last touched and only crosses when it has to. Each crossing is a
 * `readPixels` or a `texImage2D`, which is exactly the cost this whole feature
 * exists to avoid, so `transfers` is reported rather than hidden.
 */
export function executeChain(
	backend: GLBackend,
	stages: GPUStage[],
	source: ImageData
): ExecuteResult {
	const result: ExecuteResult = { frame: source, onGPU: [], fallbacks: [], transfers: 0 };

	/** The frame, when it currently lives on the CPU. */
	let cpuFrame: ImageData | null = source;
	/** The frame, when it currently lives in a texture. */
	let gpuTarget: Target | null = null;
	let gpuTexture: WebGLTexture | null = null;
	let width = source.width;
	let height = source.height;
	/** Which pooled target to render into next. */
	let ping = 0;

	const toGPU = () => {
		if (!cpuFrame) {
			return;
		}
		gpuTexture = backend.upload(cpuFrame);
		width = cpuFrame.width;
		height = cpuFrame.height;
		gpuTarget = null;
		cpuFrame = null;
		result.transfers++;
	};

	const toCPU = () => {
		if (!gpuTarget) {
			return;
		}
		cpuFrame = backend.download(gpuTarget);
		gpuTarget = null;
		gpuTexture = null;
		result.transfers++;
	};

	for (let index = 0; index < stages.length; index++) {
		const { filter, second } = stages[index];

		if (!filter.enabled) {
			continue;	//process() would just hand the frame back
		}

		const passes = passesOf(filter);
		const reason = gpuBlocker(filter, passes);

		if (reason) {
			toCPU();
			result.fallbacks.push({ index, filter: filter.constructor.name, reason });
			cpuFrame = second
				? filter.process([cpuFrame!, second])
				: filter.process(cpuFrame!);
			width = cpuFrame.width;
			height = cpuFrame.height;
			continue;
		}

		toGPU();

		const uniforms = uniformsFor(filter);
		const secondTexture = second ? backend.uploadSecond(second) : null;
		const originalTexture = keepOriginal(backend, passes!, gpuTarget ? gpuTarget.texture : gpuTexture!, width, height);
		const { width: outWidth, height: outHeight } =
			(filter.constructor as typeof Filter).outputSize(filter, width, height);
		const data = (filter.constructor as typeof Filter).data(filter);
		const dataTexture = data ? backend.uploadData(data) : null;

		//Retained frames are pushed *before* the draw, so age 0 is the frame being
		//processed - which is what the CPU implementations see, since they all
		//push the incoming frame into their buffer first. `first` mode captures
		//once and holds: DifferenceDetector compares against the frame it opened
		//on, not the previous one.
		const retains = (filter.constructor as typeof Filter).retains(filter);
		let history = null;
		if (retains) {
			history = backend.history(filter, retains, width, height);
			//recorded whether or not a push follows: in 'first' mode there is no
			//push after the opening frame, and the shader still has to be able to
			//tell that frame apart from the ones after it
			history.before = history.count;
			if (retains.mode !== 'first' || history.count === 0) {
				backend.pushHistory(history, gpuTarget ? gpuTarget.texture : gpuTexture!);
			}
		}
		let failed: string | null = null;
		let reduceTexture: WebGLTexture | null = null;

		for (const pass of passes!) {
			if (pass.reduce) {
				reduceTexture = runReduction(
					backend,
					pass.reduce,
					gpuTarget ? gpuTarget.texture : gpuTexture!,
					width,
					height,
					uniforms,
					filter.constructor.name
				);
				if (!reduceTexture) {
					failed = backend.failures.get(pass.reduce) ?? 'reduction shader failed to compile';
					break;
				}
			}

			const program = backend.program(pass.source, filter.constructor.name);
			if (!program) {
				failed = backend.failures.get(pass.source) ?? 'shader failed to compile';
				break;
			}

			const repeats = Math.max(1, pass.repeat ? pass.repeat(filter) : 1);
			for (let n = 0; n < repeats; n++) {
				//A filter is allowed to change the frame's size - Rotator turns a
				//640x480 frame into a 480x640 one. Only the first draw of a stage
				//resizes; after that the frame is already the new shape, so uSize and
				//the target agree again.
				const into = backend.target(ping, outWidth, outHeight);
				backend.draw({
					program,
					source: gpuTarget ? gpuTarget.texture : gpuTexture!,
					second: secondTexture,
					reduce: reduceTexture,
					original: originalTexture,
					data: dataTexture,
					history,
					into,
					width: outWidth,
					height: outHeight,
					sourceWidth: width,
					sourceHeight: height,
					uniforms: { ...uniforms, ...(pass.uniforms ?? {}), uPass: n }
				});
				gpuTarget = into;
				ping = ping === 0 ? 1 : 0;
				width = outWidth;
				height = outHeight;
			}
		}

		if (failed) {
			//A shader that will not compile must not silently produce a black
			//frame. Drop this stage to the CPU and carry on.
			toCPU();
			result.fallbacks.push({ index, filter: filter.constructor.name, reason: failed });
			cpuFrame = second ? filter.process([cpuFrame!, second]) : filter.process(cpuFrame!);
			continue;
		}

		result.onGPU.push(index);
	}

	toCPU();
	result.frame = cpuFrame ?? source;
	return result;
}

/**
 * Copies a stage's input somewhere its later passes can still read it, when any
 * of them mentions `uOriginal`.
 *
 * The copy is not optional. Passes ping-pong between two pooled targets, so on
 * a three-pass filter the third draw renders into the same target the input
 * arrived in - by the time the pass that wants the original runs, the original
 * has been overwritten by the filter's own working. Stashing it in a slot
 * outside the ping-pong pair costs one draw for the filters that ask.
 *
 * Detected by looking at the shader source rather than by a declaration, so it
 * cannot fall out of step with what the GLSL actually reads. A stray mention in
 * a comment costs a needless blit and nothing else.
 */
function keepOriginal(
	backend: GLBackend,
	passes: ShaderPass[],
	source: WebGLTexture,
	width: number,
	height: number
): WebGLTexture | null {
	if (!passes.some((pass) => READS_ORIGINAL.test(pass.source))) {
		return null;
	}

	const program = backend.program(COPY_PASS, 'original');
	if (!program) {
		return null;	//draw() falls back to binding uSrc, which is right for pass 1
	}

	const into = backend.target(ORIGINAL, width, height);
	backend.draw({
		program,
		source,
		into,
		width,
		height,
		sourceWidth: width,
		sourceHeight: height,
		uniforms: {}
	});
	return into.texture;
}

/**
 * Collapses the frame to a single texel holding its minimum and maximum.
 *
 * A fragment shader cannot loop over an image, but it can look at four pixels
 * and write one - so doing that repeatedly walks a pyramid down to 1x1 in
 * log2(size) draws. On a 1080p frame that is eleven tiny draws, against a
 * `readPixels` of eight megabytes and a JS loop, which is what the CPU does.
 *
 * Targets 8 and 9 in the pool are reserved for the ping-pong, so a reduction
 * cannot collide with the chain it is running inside.
 */
function runReduction(
	backend: GLBackend,
	seed: string,
	source: WebGLTexture,
	width: number,
	height: number,
	uniforms: Record<string, number | number[]>,
	label: string
): WebGLTexture | null {
	const seedProgram = backend.program(seed, `${label} (reduce)`);
	const stepProgram = backend.program(REDUCE_STEP, 'reduce step');
	if (!seedProgram || !stepProgram) {
		return null;
	}

	//The seed maps each pixel to the quantity being reduced, into red for the
	//minimum and green for the maximum. Halving from there needs no knowledge of
	//what is being reduced.
	let from = backend.target(REDUCE_A, width, height);
	backend.draw({
		program: seedProgram,
		source,
		into: from,
		width,
		height,
		sourceWidth: width,
		sourceHeight: height,
		uniforms
	});

	let currentWidth = width;
	let currentHeight = height;
	let slot = REDUCE_B;

	while (currentWidth > 1 || currentHeight > 1) {
		const nextWidth = Math.max(1, Math.ceil(currentWidth / 2));
		const nextHeight = Math.max(1, Math.ceil(currentHeight / 2));
		const into = backend.target(slot, nextWidth, nextHeight);

		backend.draw({
			program: stepProgram,
			source: from.texture,
			into,
			width: nextWidth,
			height: nextHeight,
			sourceWidth: currentWidth,
			sourceHeight: currentHeight,
			uniforms: {}
		});

		from = into;
		currentWidth = nextWidth;
		currentHeight = nextHeight;
		slot = slot === REDUCE_B ? REDUCE_C : REDUCE_B;
	}

	return from.texture;
}

/** Pool slots the reduction owns, kept clear of the chain's ping-pong pair. */
const REDUCE_A = 8;
const REDUCE_B = 9;
const REDUCE_C = 10;
/** Where a stage's input is stashed for `uOriginal`. Also outside the pair. */
const ORIGINAL = 11;

/** The three ways a shader can reach the stage's input. See `keepOriginal`. */
const READS_ORIGINAL = /\buOriginal\b|\boriginal(?:Pixel|Texel)\s*\(/;

/** Why this filter cannot run on the GPU right now, or null if it can. */
export function gpuBlocker(
	filter: Filter,
	passes: ShaderPass[] | null = passesOf(filter)
): string | null {
	const type = filter.constructor as typeof Filter;

	if (!passes) {
		return 'no shader';
	}
	if (type.stateful && !type.retains(filter)) {
		//A history cannot live in the ping-pong pair, which holds the frame coming
		//in and the frame going out and nothing else. A stateful filter has to say
		//how far back it reaches so the backend can keep a texture array for it.
		return 'stateful - declares no retained frames';
	}
	if (!type.supportsGPU(filter)) {
		//A filter can have a shader that covers only some of its options -
		//Invert's dynamic mode needs the frame's min and max, which is a
		//reduction rather than a per-pixel operation.
		return 'not supported with these options';
	}
	return null;
}
