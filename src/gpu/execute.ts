import { GLBackend, uniformsFor } from './GLBackend.js';
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
		let failed: string | null = null;

		for (const pass of passes!) {
			const program = backend.program(pass.source, filter.constructor.name);
			if (!program) {
				failed = backend.failures.get(pass.source) ?? 'shader failed to compile';
				break;
			}

			const repeats = Math.max(1, pass.repeat ? pass.repeat(filter) : 1);
			for (let n = 0; n < repeats; n++) {
				const into = backend.target(ping, width, height);
				backend.draw({
					program,
					source: gpuTarget ? gpuTarget.texture : gpuTexture!,
					second: secondTexture,
					into,
					width,
					height,
					sourceWidth: width,
					sourceHeight: height,
					uniforms: { ...uniforms, ...(pass.uniforms ?? {}), uPass: n }
				});
				gpuTarget = into;
				ping = ping === 0 ? 1 : 0;
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

/** Why this filter cannot run on the GPU right now, or null if it can. */
export function gpuBlocker(
	filter: Filter,
	passes: ShaderPass[] | null = passesOf(filter)
): string | null {
	const type = filter.constructor as typeof Filter;

	if (!passes) {
		return 'no shader';
	}
	if (type.stateful) {
		//A ring of previous frames wants a texture pool rather than a ping-pong
		//pair. Doable, but it is a different design - see FEATURES.md #3.
		return 'stateful - needs retained frames';
	}
	if (!type.supportsGPU(filter)) {
		//A filter can have a shader that covers only some of its options -
		//Invert's dynamic mode needs the frame's min and max, which is a
		//reduction rather than a per-pixel operation.
		return 'not supported with these options';
	}
	return null;
}
