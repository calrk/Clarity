import { Filter } from './Filter.js';
import { cloneImageData } from './imagedata.js';
import { defaultClock } from './random.js';
import { GLBackend } from '../gpu/GLBackend.js';
import { executeChain, gpuBlocker } from '../gpu/execute.js';

/**
 * Supplies the second frame for a two-input filter.
 *
 * Kept deliberately small. A full node graph is the honest answer for combining
 * arbitrary chains, but it is a much bigger feature and most of what people
 * actually want - "mask this chain with that one" - is a function returning a
 * frame. A {@link Pipeline} is itself a valid source, so chains compose.
 */
export type SecondInput = ImageData | Pipeline | (() => ImageData);

export interface StageOptions {
	/** Second frame, for the two-input filters (`Add`, `Blend`, `Mask`, ...). */
	second?: SecondInput;
}

interface Stage {
	filter: Filter;
	second?: SecondInput;
	/** Output of this stage on the last run, when it is safe to reuse. */
	cached?: ImageData;
	/**
	 * Whether this stage has run since the last invalidation.
	 *
	 * Distinct from having a `cached` frame: a stage in the middle of a GPU run
	 * has been computed, but its output only ever existed in a texture and was
	 * never read back, so there is nothing to hand out. Only the last stage of a
	 * run keeps a frame.
	 */
	computed?: boolean;
	/**
	 * Which backend produced the retained state a `stateful` filter is holding,
	 * so that moving between the two can throw it away. Undefined until the
	 * stage has run once.
	 */
	historyOnGPU?: boolean;
}

/** Where the last run's time went, and how much of it was avoided. */
export interface PipelineStats {
	/** Milliseconds per stage, in order. Skipped stages are 0. */
	timings: number[];
	/** Total milliseconds. */
	total: number;
	/** Stages served from cache. */
	skipped: number;
	/** Index the recompute started from, or `-1` when everything was cached. */
	from: number;
	/** Which backend ran, for a UI that wants to say so. */
	backend: 'cpu' | 'gpu' | 'mixed';
	/** Stage indices that ran as shaders. */
	onGPU: number[];
	/** Stages that had to run on the CPU, and why. */
	fallbacks: { index: number; filter: string; reason: string }[];
	/** Times the frame crossed between CPU memory and a texture. */
	transfers: number;
}

export interface PipelineOptions {
	/**
	 * Use the GPU where possible. Defaults to true, falling back silently to the
	 * CPU when WebGL2 is unavailable.
	 */
	gpu?: boolean;
	/** An existing backend to share, rather than creating another GL context. */
	backend?: GLBackend | null;
}

/**
 * An ordered list of filters, and the caching that stops it redoing work.
 *
 * Deliberately headless - no canvas, no DOM, no frame loop. That is
 * {@link Renderer}'s job. Keeping the ordering and caching separate from the
 * browser plumbing means the same logic runs in Node, gets covered by the
 * existing golden-image suite, and does not undo the DOM independence that
 * FEATURES.md #2 and #8 went to some trouble to win.
 *
 * ```js
 * const pipeline = new Pipeline([
 *   new Blur({ radius: 8 }),
 *   new EdgeDetector({ fast: true })
 * ]);
 *
 * const out = pipeline.run(frame);
 * ```
 */
export class Pipeline {
	private stages: Stage[] = [];

	/** Frame the last run started from, to detect a changed source. */
	private lastSource: ImageData | undefined;

	/** Whether the list itself changed since the last run. */
	private structureDirty = true;

	/** null when GPU is switched off, or when WebGL2 could not be had. */
	private backend: GLBackend | null = null;
	private gpuWanted: boolean;
	private backendTried = false;

	stats: PipelineStats = emptyStats();

	constructor(filters: Filter[] = [], options: PipelineOptions = {}) {
		this.gpuWanted = options.gpu !== false;
		if (options.backend) {
			this.backend = options.backend;
			this.backendTried = true;
		}
		for (const filter of filters) {
			this.add(filter);
		}
	}

	/**
	 * The GL backend, created on first use.
	 *
	 * Deferred rather than built in the constructor so that constructing a
	 * Pipeline never touches WebGL - a headless caller, or a test, should not
	 * pay for a GL context it will not use.
	 */
	private get gl(): GLBackend | null {
		if (!this.gpuWanted) {
			return null;
		}
		if (!this.backendTried) {
			this.backendTried = true;
			this.backend = GLBackend.create();
		}
		if (this.backend?.lost) {
			//A lost context cannot be recovered by using it harder. Drop to the CPU
			//and stay there rather than producing black frames.
			this.backend = null;
		}
		return this.backend;
	}

	/** Whether shaders will actually be used. */
	get usingGPU(): boolean {
		return this.gl !== null;
	}

	get length(): number {
		return this.stages.length;
	}

	/** The filters, in order. A copy - use the methods below to reorder. */
	get filters(): Filter[] {
		return this.stages.map((stage) => stage.filter);
	}

	at(index: number): Filter | undefined {
		return this.stages[index]?.filter;
	}

	indexOf(filter: Filter): number {
		return this.stages.findIndex((stage) => stage.filter === filter);
	}

	add(filter: Filter, options: StageOptions = {}): this {
		this.stages.push({ filter, second: options.second });
		this.structureDirty = true;
		return this;
	}

	insert(index: number, filter: Filter, options: StageOptions = {}): this {
		this.stages.splice(clampIndex(index, this.stages.length), 0, {
			filter,
			second: options.second
		});
		this.structureDirty = true;
		return this;
	}

	remove(target: Filter | number): this {
		const index = typeof target === 'number' ? target : this.indexOf(target);
		if (index >= 0 && index < this.stages.length) {
			const [stage] = this.stages.splice(index, 1);
			//A filter that leaves the chain and comes back should start clean,
			//rather than resuming a trail from whenever it was last in.
			stage.filter.reset();
			this.structureDirty = true;
		}
		return this;
	}

	/** Moves the filter at `from` to `to`, shifting the rest along. */
	move(from: number, to: number): this {
		if (from < 0 || from >= this.stages.length) {
			return this;
		}
		const [stage] = this.stages.splice(from, 1);
		this.stages.splice(clampIndex(to, this.stages.length), 0, stage);
		this.structureDirty = true;
		return this;
	}

	clear(): this {
		for (const stage of this.stages) {
			stage.filter.reset();
		}
		this.stages = [];
		this.structureDirty = true;
		return this;
	}

	/** Throws every cached frame away, forcing a full recompute next run. */
	invalidate(): this {
		for (const stage of this.stages) {
			stage.cached = undefined;
			stage.computed = false;
		}
		this.lastSource = undefined;
		this.structureDirty = true;
		return this;
	}

	/** Releases the GL context. Safe to call on a CPU-only pipeline. */
	dispose(): void {
		this.backend?.dispose();
		this.backend = null;
		this.invalidate();
	}

	/**
	 * Runs the chain and returns the result.
	 *
	 * Only the stages that can have changed are recomputed. Everything upstream
	 * of the first stage that is dirty, impure or newly reordered comes out of
	 * the cache, which is what makes tweaking the last filter in a long chain
	 * cheap.
	 */
	run(source: ImageData): ImageData {
		const backend = this.gl;
		this.dropStaleHistory(backend);
		const from = this.firstStaleStage(source, backend);
		const timings = new Array<number>(this.stages.length).fill(0);

		this.lastSource = source;
		this.structureDirty = false;

		if (from === -1) {
			//nothing can have moved, so the last stage's output still stands
			const cached = this.stages[this.stages.length - 1]?.cached;
			this.stats = { ...emptyStats(), timings, skipped: this.stages.length };
			return cached ?? source;
		}

		//The frame handed to the first recomputed stage comes out of the cache,
		//and filters are entitled to mutate what they are given. No filter
		//currently does, but a copy here is one allocation per render against a
		//corrupted cache that would be very hard to diagnose.
		let frame = from === 0 ? source : cloneImageData(this.stages[from - 1].cached!);

		const onGPU: number[] = [];
		const fallbacks: PipelineStats['fallbacks'] = [];
		let transfers = 0;

		const started = defaultClock();
		let i = from;

		while (i < this.stages.length) {
			const runEnd = backend ? this.endOfGPURun(i, backend) : i;

			if (runEnd > i || (backend && this.onGPU(this.stages[i].filter, backend))) {
				//A maximal run of shader stages goes to the backend as one unit, so
				//the frame is uploaded once, ping-ponged through every stage, and read
				//back once at the end. Executing them one at a time would mean a
				//readback per stage, which is the cost this whole path exists to
				//avoid.
				const at = defaultClock();
				const result = executeChain(
					backend!,
					this.stages.slice(i, runEnd + 1).map((stage) => ({
						filter: stage.filter,
						second: stage.second === undefined
							? undefined
							: resolveSecond(stage.second, source)
					})),
					frame
				);

				frame = result.frame;
				timings[i] = defaultClock() - at;
				transfers += result.transfers;
				for (const index of result.onGPU) onGPU.push(i + index);
				for (const fallback of result.fallbacks) {
					fallbacks.push({ ...fallback, index: i + fallback.index });
				}

				//Only the last stage of the run keeps a frame: the intermediates
				//never left the GPU, so there is nothing to cache. They are marked
				//computed so the cache does not mistake them for never-run.
				for (let n = i; n <= runEnd; n++) {
					this.stages[n].filter.dirty = false;
					this.stages[n].cached = undefined;
					this.stages[n].computed = true;
				}
				const last = this.stages[runEnd];
				last.cached = isPure(last.filter) ? frame : undefined;

				i = runEnd + 1;
				continue;
			}

			const stage = this.stages[i];
			const at = defaultClock();

			frame = stage.second === undefined
				? stage.filter.process(frame)
				: stage.filter.process([frame, resolveSecond(stage.second, source)]);

			timings[i] = defaultClock() - at;
			stage.filter.dirty = false;
			stage.computed = true;

			//A stateful or varying filter's output is not a function of its input,
			//so there is nothing worth keeping.
			stage.cached = isPure(stage.filter) ? frame : undefined;

			if (backend) {
				fallbacks.push({
					index: i,
					filter: stage.filter.constructor.name,
					reason: gpuBlocker(stage.filter) ?? 'no shader'
				});
			}
			i++;
		}

		this.stats = {
			timings,
			total: defaultClock() - started,
			skipped: from,
			from,
			backend: onGPU.length === 0 ? 'cpu' : fallbacks.length === 0 ? 'gpu' : 'mixed',
			onGPU,
			fallbacks,
			transfers
		};

		return frame;
	}

	/**
	 * Throws away the retained frames of any `stateful` filter whose history can
	 * no longer be trusted.
	 *
	 * A trail, a ring or a reference frame is only meaningful if it was built
	 * from an unbroken run of frames through the same filter, in the same place,
	 * with the same settings. Four things break that, and all four are cheap to
	 * detect:
	 *
	 * - the chain was edited, so the frames feeding this stage are not the ones
	 *   that built its history (`structureDirty`; `remove` and `clear` reset the
	 *   departing filter directly, since it is no longer here to be swept)
	 * - a property changed, which is exactly what `dirty` means
	 * - the filter moved between the CPU and the GPU, leaving two divergent
	 *   copies of the history
	 *
	 * In practice most callers build a chain once and run it forever, so this
	 * fires on the first frame and then never again.
	 */
	private dropStaleHistory(backend: GLBackend | null): void {
		for (const stage of this.stages) {
			if (!(stage.filter.constructor as typeof Filter).stateful) {
				continue;
			}
			const onGPU = this.onGPU(stage.filter, backend);
			const moved = stage.historyOnGPU !== undefined && stage.historyOnGPU !== onGPU;

			if (this.structureDirty || stage.filter.dirty || moved) {
				stage.filter.reset();
			}
			stage.historyOnGPU = onGPU;
		}
	}

	/** Whether this filter would run as a shader right now. */
	private onGPU(filter: Filter, backend: GLBackend | null): boolean {
		return backend !== null && gpuBlocker(filter) === null;
	}

	/** Index of the last stage in the shader run starting at `start`. */
	private endOfGPURun(start: number, backend: GLBackend): number {
		let end = start;
		while (
			end + 1 < this.stages.length &&
			this.onGPU(this.stages[end + 1].filter, backend)
		) {
			end++;
		}
		return this.onGPU(this.stages[start].filter, backend) ? end : start;
	}

	/**
	 * Index of the earliest stage that has to be recomputed, or `-1` when the
	 * whole chain can be served from cache.
	 */
	private firstStaleStage(source: ImageData, backend: GLBackend | null): number {
		if (this.stages.length === 0) {
			return -1;
		}

		//A different source frame invalidates everything. Reference equality is
		//the right test: a video hands over a fresh ImageData every frame, while
		//a still image hands over the same one.
		if (this.structureDirty || source !== this.lastSource) {
			return 0;
		}

		const stale = this.earliestStale();
		if (stale === -1) {
			return -1;
		}

		//A shader run is recomputed as a whole, because only its final stage kept
		//a frame - there is no intermediate to restart from. Walk back to where
		//the run begins.
		let start = stale;
		while (start > 0 && this.onGPU(this.stages[start].filter, backend)) {
			if (!this.onGPU(this.stages[start - 1].filter, backend)) {
				break;
			}
			start--;
		}
		return start;
	}

	private earliestStale(): number {
		for (let i = 0; i < this.stages.length; i++) {
			const stage = this.stages[i];
			//An impure filter has to run every frame, and a stage that has never
			//run has nothing behind it - both mean recompute from here down.
			if (stage.filter.dirty || !isPure(stage.filter) || !stage.computed) {
				return i;
			}
		}

		return -1;
	}
}

function isPure(filter: Filter): boolean {
	return (filter.constructor as typeof Filter).pure;
}

/**
 * A nested pipeline is fed the outer run's *source*, not the frame at the point
 * it is used - it is a branch off the input, not a continuation of the chain.
 *
 * That is both the more predictable reading of "mask this chain with that one",
 * and the only one where the inner pipeline's cache can ever hit: fed the
 * current frame it would see a new input every time anything upstream changed.
 * Feed it something else with a function if you need to.
 */
function resolveSecond(second: SecondInput, source: ImageData): ImageData {
	if (second instanceof Pipeline) {
		return second.run(source);
	}
	return typeof second === 'function' ? second() : second;
}

function clampIndex(index: number, length: number): number {
	return Math.min(Math.max(index, 0), length);
}

function emptyStats(): PipelineStats {
	return {
		timings: [],
		total: 0,
		skipped: 0,
		from: -1,
		backend: 'cpu',
		onGPU: [],
		fallbacks: [],
		transfers: 0
	};
}
