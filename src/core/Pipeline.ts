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
	/**
	 * First frame, replacing the one arriving from the stage before.
	 *
	 * The chain's input is normally whatever the previous stage produced, which
	 * is what makes it a chain. This says otherwise: take the frame from here
	 * instead. Everything upstream still runs - it is only this stage that stops
	 * listening - so in practice it is used on the first stage of a chain, where
	 * there is nothing upstream to ignore.
	 *
	 * That is what makes a two-input filter symmetric. Without it, combining two
	 * generated branches means one of them has to be the chain and the other the
	 * argument, which reads as though they were different kinds of thing:
	 *
	 * ```js
	 * // lopsided: `across` is the chain, `upward` is wired into it
	 * renderer.add(new Multiply(), { second: upward });
	 *
	 * // even-handed: both are branches, and the source is not involved
	 * renderer.add(new Multiply(), { first: across, second: upward });
	 * ```
	 *
	 * Resolved exactly like {@link second}, so a nested Pipeline here is handed
	 * the outer run's source too.
	 */
	first?: SecondInput;
}

interface Stage {
	filter: Filter;
	second?: SecondInput;
	first?: SecondInput;
	/**
	 * Which version of each branch this stage last consumed - see
	 * {@link Pipeline.version}. Undefined until the stage has read one.
	 */
	firstVersion?: number;
	secondVersion?: number;
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
	/**
	 * Times a full frame crossed between CPU memory and a texture - the frame
	 * being processed, and any second input uploaded alongside it.
	 *
	 * Two crossings are deliberately not counted, both because they are bounded
	 * rather than frame-sized: the thumbnail `samples` filters read back before
	 * their shader runs, and the small data textures `Filter.data` supplies for
	 * palettes and ramps. Neither scales with the picture, which is the thing
	 * this number exists to warn about.
	 */
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
	private glBackend: GLBackend | null = null;
	private gpuWanted: boolean;
	private backendTried = false;
	/**
	 * Whether the backend came from somewhere else, and so is not ours to
	 * destroy. A browser allows only a handful of live WebGL contexts, so
	 * sharing one is the sane thing for several pipelines on a page to do - but
	 * it means {@link dispose} must release only what it created, or the first
	 * branch to be thrown away takes the others down with it.
	 */
	private borrowedBackend = false;

	/** See {@link version}. */
	private runVersion = 0;

	stats: PipelineStats = emptyStats();

	constructor(filters: Filter[] = [], options: PipelineOptions = {}) {
		this.gpuWanted = options.gpu !== false;
		if (options.backend) {
			this.glBackend = options.backend;
			this.backendTried = true;
			this.borrowedBackend = true;
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
	 *
	 * Public so that a second pipeline can be built against the same context
	 * rather than opening another. Reading it *creates* the context, which is
	 * the point - a caller asking to share one is a caller that has decided it
	 * wants the GPU. Pass the result as {@link PipelineOptions.backend}, and the
	 * borrower will leave it alone when it is disposed.
	 */
	get backend(): GLBackend | null {
		if (!this.gpuWanted) {
			return null;
		}
		if (!this.backendTried) {
			this.backendTried = true;
			this.glBackend = GLBackend.create();
		}
		if (this.glBackend?.lost) {
			//A lost context cannot be recovered by using it harder. Drop to the CPU
			//and stay there rather than producing black frames.
			this.glBackend = null;
		}
		return this.glBackend;
	}

	/** Whether shaders will actually be used. */
	get usingGPU(): boolean {
		return this.backend !== null;
	}

	/**
	 * Whether shaders are *wanted*. Distinct from {@link usingGPU}, which also
	 * depends on whether WebGL2 could be had at all.
	 *
	 * Switching this throws away every cached frame, because the two backends
	 * agree closely rather than exactly and a chain half-computed on each would
	 * mix them. Stateful filters have their history dropped too, on the next
	 * run - see `dropStaleHistory`.
	 */
	get gpu(): boolean {
		return this.gpuWanted;
	}

	/**
	 * Setting this reaches the branches too, because "run this chain on the CPU"
	 * that leaves most of the work on the GPU is not an answer to anything.
	 *
	 * It was the top-level pipeline only, and the effect was to make the question
	 * unaskable: `new Renderer(canvas, { gpu: false })` on a composed chain left
	 * every branch on shaders, and the playground's backend badge did the same in
	 * code mode - a CPU/GPU comparison of a branching chain came back with both
	 * sides timing identically, which is a believable answer and a wrong one.
	 *
	 * It does overrule a branch that asked for a backend of its own. That is the
	 * right way round for the two callers there are - a badge is somebody
	 * deciding, and a `gpu` option on the outer chain is somebody describing the
	 * whole thing - and a branch that must differ can be set again afterwards.
	 */
	set gpu(wanted: boolean) {
		//Not guarded on the current value: a branch can disagree with its parent,
		//having been built separately or set directly, and returning early here
		//would leave it disagreeing forever. The branches' own setters stop the
		//recursion from doing any work where nothing changed.
		const changed = wanted !== this.gpuWanted;
		this.gpuWanted = wanted;

		for (const stage of this.stages) {
			for (const branch of branches(stage)) {
				branch.gpu = wanted;
			}
		}

		if (changed) {
			this.invalidate();
		}
	}

	get length(): number {
		return this.stages.length;
	}

	/** The filters, in order. A copy - use the methods below to reorder. */
	get filters(): Filter[] {
		return this.stages.map((stage) => stage.filter);
	}

	/**
	 * Whether anything in here will draw a different frame if asked again later -
	 * which is what a host needs in order to decide whether to run a frame loop
	 * over a still image.
	 *
	 * Branches included, and that is the whole reason this is not a one-line
	 * `filters.some(...)` at the call site. A chain whose only moving part is a
	 * `Translator` inside a second input has no animated filter at the top level
	 * at all, so asking `filters` gives the confident wrong answer and the fog
	 * sits still. Only a Pipeline can see its own branches; `filters` lists
	 * filters and not the chains wired alongside them.
	 *
	 * A `second` given as a function is assumed *not* to animate. It may well -
	 * the playground's own source picker is one - but there is nothing to
	 * inspect, and guessing yes would run the loop forever for every chain with
	 * a two-input filter in it.
	 */
	get animated(): boolean {
		return this.stages.some((stage) => {
			if (!stage.filter.enabled) {
				return false;
			}
			if ((stage.filter.constructor as typeof Filter).animated(stage.filter)) {
				return true;
			}
			return branches(stage).some((branch) => branch.animated);
		});
	}

	/**
	 * Whether a run right now would hand back exactly what the last one did, so
	 * a stage using this as a second input can be served from cache.
	 *
	 * The same blind spot as {@link animated}, in the place where it costs more.
	 * `Multiply` is pure, so two of them composing a pair of drifting fogs are
	 * both cacheable by their own reckoning - the chain is served from cache
	 * forever and the fog sits still even with the frame loop running. Purity has
	 * to be a property of the stage *and everything wired into it*.
	 *
	 * A `second` given as a function is treated as stable, matching
	 * {@link animated}: there is nothing to inspect, and assuming it changes
	 * would stop every chain with a two-input filter in it from ever caching.
	 * A caller who knows better calls {@link invalidate}.
	 */
	get stable(): boolean {
		if (this.structureDirty) {
			return false;
		}
		return this.stages.every((stage) => {
			if (!stage.filter.enabled) {
				return true;	//it hands the frame straight back
			}
			if (!isPure(stage.filter) || stage.filter.dirty) {
				return false;
			}
			return !branchMoved(stage);
		});
	}

	/**
	 * How many times this pipeline has produced a new frame.
	 *
	 * The counterpart to {@link stable}, and the reason one is not enough.
	 * `stable` looks forward - "would running me again match what I last
	 * produced" - which is the right question for a caller deciding whether to
	 * bother. It is the wrong question for a stage that consumed this pipeline
	 * on an *earlier* run, because it is answered relative to this pipeline's
	 * last run rather than the consumer's.
	 *
	 * The two come apart the moment one branch feeds two places, which is not
	 * exotic - a matte and its inverse is the ordinary case. The first consumer
	 * runs the branch, which clears the dirty flags that made it unstable; the
	 * second consumer then asks `stable`, is told yes, and is served the frame it
	 * cached *last* time. A dissolve composited that way shows a matte from this
	 * frame against an inverse from the one before, and the two no longer cover
	 * each other.
	 *
	 * A version is not relative to anything, so a stage can record what it read
	 * and compare. Bumped whenever a run recomputed a stage - which over-reports
	 * when a recompute happens to land on identical pixels, exactly as `stable`
	 * already does.
	 */
	get version(): number {
		return this.runVersion;
	}

	at(index: number): Filter | undefined {
		return this.stages[index]?.filter;
	}

	indexOf(filter: Filter): number {
		return this.stages.findIndex((stage) => stage.filter === filter);
	}

	add(filter: Filter, options: StageOptions = {}): this {
		this.stages.push({ filter, second: options.second, first: options.first });
		this.structureDirty = true;
		return this;
	}

	insert(index: number, filter: Filter, options: StageOptions = {}): this {
		this.stages.splice(clampIndex(index, this.stages.length), 0, {
			filter,
			second: options.second,
			first: options.first
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

	/**
	 * Releases the GL context. Safe to call on a CPU-only pipeline.
	 *
	 * A *borrowed* backend is left running, because whoever lent it is still
	 * using it. Reading `this.glBackend` directly rather than the getter, so
	 * disposing a pipeline that never touched the GPU does not open a context in
	 * order to close it.
	 */
	dispose(): void {
		if (!this.borrowedBackend) {
			this.glBackend?.dispose();
		}
		this.glBackend = null;
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
		const backend = this.backend;
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
			//A stage with a `first` does not read the chain, it replaces it. Done
			//here rather than inside either branch below because `frame` is both the
			//CPU path's input and what the GPU path uploads.
			//
			//Cloned for the same reason the cached frame above is: this is very
			//often a branch pipeline's own cached output, and a filter is entitled
			//to mutate what it is handed.
			if (this.stages[i].first !== undefined) {
				frame = cloneImageData(this.resolve(this.stages[i], 'first', source));
			}

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
							: this.resolve(stage, 'second', source)
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
				//`process` matches the second frame to this one - see Filter.process
				: stage.filter.process([frame, this.resolve(stage, 'second', source)]);

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

		//Reached only when something was recomputed - the fully-cached run returns
		//above, and has by definition produced nothing new to tell anyone about.
		this.runVersion++;

		return frame;
	}

	/**
	 * Reads one of a stage's wired-in inputs, and notes which version it got.
	 *
	 * The note is the whole point - every call site that reads a branch goes
	 * through here so that none of them can forget, because a stage that reads a
	 * branch without recording it is a stage that will happily serve a stale
	 * frame forever. See {@link version}.
	 */
	private resolve(stage: Stage, side: 'first' | 'second', source: ImageData): ImageData {
		const input = stage[side]!;
		const frame = resolveSecond(input, source);

		if (input instanceof Pipeline) {
			if (side === 'first') {
				stage.firstVersion = input.version;
			} else {
				stage.secondVersion = input.version;
			}
		}

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

	/**
	 * Index of the last stage in the shader run starting at `start`.
	 *
	 * A stage with a `first` ends the run before it. Everything in a shader run
	 * shares one uploaded frame ping-ponged between two targets, and a stage that
	 * discards that frame for another one cannot be expressed in it - so it
	 * begins a run of its own, paying one readback to do so.
	 */
	private endOfGPURun(start: number, backend: GLBackend): number {
		let end = start;
		while (
			end + 1 < this.stages.length &&
			this.stages[end + 1].first === undefined &&
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
			//`first` begins a run, so there is nothing to walk back into - and
			//walking past it would recompute stages whose output it discards
			if (this.stages[start].first !== undefined) {
				break;
			}
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
			//run has nothing behind it - both mean recompute from here down. So
			//does a branch that is still moving, which the filter alone cannot say:
			//`Multiply` is pure whatever is wired into it.
			if (
				stage.filter.dirty ||
				!isPure(stage.filter) ||
				!stage.computed ||
				branchMoved(stage)
			) {
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
 * The chains wired into a stage - which is what `filters` cannot see, and the
 * reason `animated` has to ask.
 *
 * Only Pipelines: a `second` or `first` given as a function is opaque, and the
 * properties that use this document what is assumed of one.
 */
function branches(stage: Stage): Pipeline[] {
	const found: Pipeline[] = [];
	if (stage.first instanceof Pipeline) found.push(stage.first);
	if (stage.second instanceof Pipeline) found.push(stage.second);
	return found;
}

/** Whether either branch has moved, or is about to, since this stage read it. */
function branchMoved(stage: Stage): boolean {
	return (
		moved(stage.first, stage.firstVersion) || moved(stage.second, stage.secondVersion)
	);
}

/**
 * Two questions, and a stage is stale if either answers yes.
 *
 * `stable` looks forward: running this branch again would produce something
 * new, so whatever we cached is already out of date. The version looks back: it
 * has *already* produced something new since we last read it, which is what
 * happens when another stage got there first this frame and cleaned the dirty
 * flags on the way past.
 *
 * Asking only the first is the bug {@link Pipeline.version} describes. Asking
 * only the second never starts anything moving, because a branch that has not
 * run yet is still on the version we last saw.
 */
function moved(input: SecondInput | undefined, seen: number | undefined): boolean {
	if (!(input instanceof Pipeline)) {
		return false;
	}
	return !input.stable || input.version !== seen;
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
