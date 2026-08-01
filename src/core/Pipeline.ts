import { Filter } from './Filter.js';
import { cloneImageData } from './imagedata.js';
import { defaultClock } from './random.js';

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

	stats: PipelineStats = { timings: [], total: 0, skipped: 0, from: -1 };

	constructor(filters: Filter[] = []) {
		for (const filter of filters) {
			this.add(filter);
		}
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
			this.stages.splice(index, 1);
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
		this.stages = [];
		this.structureDirty = true;
		return this;
	}

	/** Throws every cached frame away, forcing a full recompute next run. */
	invalidate(): this {
		for (const stage of this.stages) {
			stage.cached = undefined;
		}
		this.lastSource = undefined;
		this.structureDirty = true;
		return this;
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
		const from = this.firstStaleStage(source);
		const timings = new Array<number>(this.stages.length).fill(0);

		this.lastSource = source;
		this.structureDirty = false;

		if (from === -1) {
			//nothing can have moved, so the last stage's output still stands
			const cached = this.stages[this.stages.length - 1]?.cached;
			this.stats = {
				timings,
				total: 0,
				skipped: this.stages.length,
				from: -1
			};
			return cached ?? source;
		}

		//The frame handed to the first recomputed stage comes out of the cache,
		//and filters are entitled to mutate what they are given. No filter
		//currently does, but a copy here is one allocation per render against a
		//corrupted cache that would be very hard to diagnose.
		let frame = from === 0 ? source : cloneImageData(this.stages[from - 1].cached!);

		const started = defaultClock();
		for (let i = from; i < this.stages.length; i++) {
			const stage = this.stages[i];
			const at = defaultClock();

			frame = stage.second === undefined
				? stage.filter.process(frame)
				: stage.filter.process([frame, resolveSecond(stage.second, source)]);

			timings[i] = defaultClock() - at;
			stage.filter.dirty = false;

			//A stateful or varying filter's output is not a function of its input,
			//so there is nothing worth keeping.
			stage.cached = isPure(stage.filter) ? frame : undefined;
		}

		this.stats = {
			timings,
			total: defaultClock() - started,
			skipped: from,
			from
		};

		return frame;
	}

	/**
	 * Index of the earliest stage that has to be recomputed, or `-1` when the
	 * whole chain can be served from cache.
	 */
	private firstStaleStage(source: ImageData): number {
		if (this.stages.length === 0) {
			return -1;
		}

		//A different source frame invalidates everything. Reference equality is
		//the right test: a video hands over a fresh ImageData every frame, while
		//a still image hands over the same one.
		if (this.structureDirty || source !== this.lastSource) {
			return 0;
		}

		for (let i = 0; i < this.stages.length; i++) {
			const stage = this.stages[i];
			//An impure filter has to run every frame, and a stage with no cache
			//has nothing to serve - both mean recompute from here down.
			if (stage.filter.dirty || !isPure(stage.filter) || stage.cached === undefined) {
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
