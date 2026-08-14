// The playground.
//
// One page that replaces the eight the library used to ship: the sources became
// a list of things to point a Renderer at, the eight copies of the render loop
// became one Renderer, and the eight hand-built control panels became one
// schema-driven renderer that handles every filter including the ones that
// never had controls.

import * as CLARITY from '@calrk/clarity';
import { CATALOGUE, CATEGORY_ORDER, Pipeline, Renderer, TRAITS } from '@calrk/clarity';

import { createChainView, isDualInput } from './chain.js';
import {
	bindPipeline,
	bindRenderer,
	buildScope,
	declarationPoint,
	loadBuffer,
	runSnippet,
	saveBuffer,
	variableName
} from './code.js';
import { PRESETS } from './presets.js';
import { readHash, writeHash } from './share.js';
import { DEFAULT_SNIPPET, SNIPPETS } from './snippets.js';
import { SOURCES, addSource, loadFile, loadImage, openSource } from './sources.js';
import './styles.css';

const $ = (id) => document.getElementById(id);

const canvas = $('canvas');
const renderer = new Renderer(canvas, { onFrame: showStats });

/** Second-input frames for the dual-input filters, by stage. */
const seconds = new Map();
/** Source frames the dual-input filters can choose between. */
let secondFrames = new Map();

/**
 * The drag-list chain, held separately from `renderer.pipeline`.
 *
 * In code mode the renderer is pointed at a chain a snippet returned, so
 * `renderer.pipeline` stops being the one the Build tab is editing. Everything
 * that maintains the built chain goes through this instead, and switching back
 * restores it rather than rebuilding it from the URL.
 */
const buildPipeline = renderer.pipeline;

/** 'build' or 'code'. */
let mode = 'build';
/** The chain the last successful snippet returned, so it can be disposed. */
let codePipeline = null;
/**
 * Whether shaders are wanted, tracked here rather than read back off the
 * renderer: `renderer.gpu` delegates to whichever pipeline is current, so in
 * code mode it would answer for a chain that is replaced on every run.
 */
let gpuWanted = true;

let currentSourceId = null;
/** The live element, so a camera or video can be shut down when replaced. */
let currentElement = null;
/**
 * The size the source is being read at, or null for its own.
 *
 * Held here as well as on the renderer because the URL has to say whether it
 * was *asked for*: a link that pins 1024x1024 must keep meaning that even if
 * the sample behind it is one day replaced with a picture that size anyway.
 */
let sourceSize = null;
/** What the current source is when nothing overrides it, for the placeholders. */
let naturalSize = null;
let smoothedFrameTime = 0;
/** Whether the *source* produces new frames; the chain can also be the moving part. */
let sourceLive = false;

// ---------------------------------------------------------------- palette

/**
 * The chips that say what a filter needs before it will do anything.
 *
 * These are the failures that look like nothing happening: a motion detector on
 * a still photograph, a dot remover on a picture that was never thresholded.
 * The text comes from `TRAITS` in the library rather than from a list here,
 * because the playground keeping its own copy is how the three filter lists
 * that `CATALOGUE` replaced went out of date in the first place.
 *
 * @returns {HTMLElement|null} null when the filter is the ordinary case
 */
function traitChips(entry) {
	if (!entry.traits?.length) return null;

	const row = document.createElement('span');
	row.className = 'chips';
	for (const trait of entry.traits) {
		const chip = document.createElement('span');
		chip.className = `chip chip-${trait}`;
		chip.textContent = TRAITS[trait].label;
		chip.title = TRAITS[trait].description;
		row.appendChild(chip);
	}
	return row;
}

function buildPalette(query = '') {
	const palette = $('palette');
	palette.replaceChildren();

	const needle = query.trim().toLowerCase();
	let shown = 0;

	for (const category of CATEGORY_ORDER) {
		const matches = Object.entries(CATALOGUE).filter(
			([name, entry]) =>
				entry.category === category &&
				(!needle ||
					name.toLowerCase().includes(needle) ||
					entry.summary.toLowerCase().includes(needle))
		);
		if (!matches.length) continue;

		const heading = document.createElement('h3');
		heading.textContent = category;
		palette.appendChild(heading);

		if (category === 'Starters') {
			//they generate a frame rather than transforming one, which is only
			//obvious once you have wondered why they ignore your image
			const note = document.createElement('p');
			note.className = 'palette-note';
			note.textContent = 'These ignore their input. Pair them with the Blank source.';
			palette.appendChild(note);
		}

		for (const [name, entry] of matches) {
			const button = document.createElement('button');
			button.type = 'button';
			button.append(name);

			const summary = document.createElement('small');
			summary.textContent = entry.summary;
			button.appendChild(summary);

			const chips = traitChips(entry);
			if (chips) button.appendChild(chips);

			button.addEventListener('click', () => addFilter(name));
			palette.appendChild(button);
			shown++;
		}
	}

	$('paletteCount').textContent = needle ? `${shown} of ${Object.keys(CATALOGUE).length}` : shown;
}

// ---------------------------------------------------------------- the chain

const chainView = createChainView($('chain'), {
	onMove(from, to) {
		renderer.move(from, to);
		sync();
	},
	onRemove(index) {
		seconds.delete(renderer.pipeline.at(index));
		renderer.remove(index);
		sync();
	},
	onToggle(index) {
		const filter = renderer.pipeline.at(index);
		filter.enabled = !filter.enabled;
		sync();
	},
	onChange() {
		//a property changed; the pipeline already knows it is dirty
		updateShare();
		updateCode();
		requestFrame();
	},
	get secondInputs() {
		return [
			{ id: 'source', label: 'The unfiltered source' },
			...SOURCES.filter((source) => source.kind === 'image').map((source) => ({
				id: source.id,
				label: source.label
			}))
		];
	},
	onSecondInput(index, id) {
		seconds.set(renderer.pipeline.at(index), id);
		rebuildStages();
		sync();
	},
	onReroll(index) {
		reroll([renderer.pipeline.at(index)]);
	}
});

/** Every filter in the chain that hashes its randomness from a seed. */
function seeded() {
	return renderer.pipeline.filters.filter((filter) => 'seed' in (filter.constructor.schema ?? {}));
}

/**
 * Rolls new seeds, and writes them into the chain rather than leaving them
 * implicit.
 *
 * A filter with no `seed` set picks one when it is built and keeps it, which is
 * what stops a cloud flickering - but it also means the link you share opens on
 * a *different* cloud for whoever you send it to, since their page builds its
 * own filters. Rolling writes a concrete number, so from then on the URL says
 * which cloud it is and everyone sees the same one.
 */
function reroll(filters) {
	for (const filter of filters) {
		filter.setProperty('seed', Math.floor(Math.random() * 16777216));
	}
	sync();
}

function addFilter(name, options = {}, enabled = true) {
	const filter = new CLARITY[name](options);
	filter.enabled = enabled;

	if (isDualInput(name)) {
		seconds.set(filter, 'source');
	}
	renderer.add(filter, stageOptions(filter));
	sync();
	return filter;
}

/**
 * A two-input filter's second frame.
 *
 * A function rather than a fixed frame, so it tracks the source as it changes -
 * `second` accepts an ImageData, a function returning one, or a whole Pipeline.
 */
function stageOptions(filter) {
	if (!seconds.has(filter)) {
		return undefined;
	}
	return {
		second: () => {
			const id = seconds.get(filter);
			const frame = id === 'source' ? renderer.sourceFrame : secondFrames.get(id);
			return frame ?? renderer.sourceFrame;
		}
	};
}

/**
 * Rebuilds every stage in place, which is how a changed second input reaches
 * the pipeline - `second` is a stage option, not a filter property, so there is
 * no setter for it.
 */
function rebuildStages() {
	const filters = renderer.pipeline.filters;
	renderer.pipeline.clear();
	for (const filter of filters) {
		renderer.add(filter, stageOptions(filter));
	}
}

// ---------------------------------------------------------------- presets

/**
 * Applying a preset is one assignment.
 *
 * A preset is a chain string and a chain string is the URL, so this lands on
 * the same `hashchange` -> `loadFromHash` path a pasted link takes. Nothing
 * here rebuilds the pipeline itself, which is the point: there is no second
 * apply path to drift from what a shared link does.
 *
 * Assigning to `location.hash` also pushes a history entry, so browser-back
 * restores whatever chain was there. An action that replaces your work would
 * otherwise want a confirmation step; this one does not need one.
 */
function applyPreset(preset) {
	if (location.hash === `#${preset.chain}`) {
		//already exactly here, so hashchange would not fire - rebuild anyway, so
		//the button never looks broken
		loadFromHash();
		return;
	}
	location.hash = preset.chain;
}

/**
 * How many presets show before the list folds.
 *
 * Chips beat a dropdown for this because picking one is a single click and the
 * whole set is readable at a glance - but that stops being true once the row
 * wraps three deep and pushes the pipeline off the screen. Four plus an
 * expander keeps one row and keeps the click.
 */
const PRESETS_SHOWN = 4;
let presetsExpanded = false;

function buildPresetList() {
	const list = $('presets');
	list.replaceChildren();

	const shown = presetsExpanded ? PRESETS : PRESETS.slice(0, PRESETS_SHOWN);
	for (const preset of shown) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'preset';
		button.textContent = preset.label;
		button.title = preset.note;
		button.dataset.preset = preset.id;
		button.addEventListener('click', () => applyPreset(preset));
		list.appendChild(button);
	}

	if (PRESETS.length > PRESETS_SHOWN) {
		const more = document.createElement('button');
		more.type = 'button';
		more.className = 'preset preset-more';
		more.id = 'presetsMore';
		more.textContent = presetsExpanded ? 'Fewer' : `+${PRESETS.length - PRESETS_SHOWN} more`;
		more.setAttribute('aria-expanded', String(presetsExpanded));
		more.addEventListener('click', () => {
			presetsExpanded = !presetsExpanded;
			buildPresetList();
		});
		list.appendChild(more);
	}
}

// ---------------------------------------------------------------- sources

function buildSourceList() {
	const list = $('sources');
	list.replaceChildren();

	for (const source of SOURCES) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'source';
		button.dataset.id = source.id;
		//so the page can be asked which sources are meant to move - the test that
		//checks the videos actually play enumerates these rather than naming them,
		//which is what stops a newly added video from going unchecked
		button.dataset.kind = source.kind;
		button.title = source.label;
		button.setAttribute('aria-pressed', String(source.id === currentSourceId));

		if (source.thumb) {
			const img = document.createElement('img');
			img.src = source.thumb;
			img.alt = '';
			button.appendChild(img);
		}

		//The glyph is the only thing distinguishing a video from a still, so it
		//survives the arrival of a poster thumbnail rather than being replaced by
		//it - a badge over the picture when there is one, the whole tile when
		//there is not.
		if (source.glyph || !source.thumb) {
			const glyph = document.createElement('span');
			glyph.className = source.thumb ? 'glyph badge' : 'glyph';
			glyph.textContent = source.glyph ?? '▦';
			button.appendChild(glyph);
		}

		const label = document.createElement('span');
		label.className = 'label';
		label.textContent = source.label;
		button.appendChild(label);

		button.addEventListener('click', () => useSource(source.id));

		//A button cannot contain a button, so the tile and its insert control are
		//siblings in a wrapper rather than nested. Everything that reaches into
		//this list therefore asks for `button.source` rather than for children.
		const tile = document.createElement('div');
		tile.className = 'tile';
		tile.appendChild(button);

		//Code mode only, and a separate control rather than a second meaning for
		//the click: clicking a source already picks what the chain runs on, which
		//is the commonest thing to want and should not need the code edited. The
		//same gesture meaning different things in different modes reads as a bug
		//the first time you meet it.
		if (source.kind === 'image') {
			const insert = document.createElement('button');
			insert.type = 'button';
			insert.className = 'tile-insert';
			insert.dataset.insert = source.id;
			insert.textContent = '+';
			insert.title = `Declare ${source.label} as a variable`;
			insert.setAttribute('aria-label', `Insert ${source.label} into the snippet`);
			insert.addEventListener('click', () => insertSample(source));
			tile.appendChild(insert);
		}

		list.appendChild(tile);
	}
}

/**
 * Writes `const books = samples.books;` into the snippet.
 *
 * Through `execCommand` rather than by assigning `.value`. It is deprecated and
 * it is also the only way to insert text into a textarea that leaves the native
 * undo stack intact - setting `.value` wipes it, so every insert would cost you
 * Ctrl+Z, which is worse than the deprecation.
 */
function insertSample(source) {
	const editor = $('snippet');
	const name = variableName(source.id);

	//Already declared, so declaring it again is a syntax error rather than a
	//convenience. Show them the one that exists instead - which is also the
	//answer to double-clicking, and to wondering where it went.
	const existing = editor.value.indexOf(`const ${name} =`);
	if (existing >= 0) {
		editor.focus();
		editor.setSelectionRange(existing, existing + `const ${name} =`.length);
		return;
	}

	const at = declarationPoint(editor.value);
	const line = `const ${name} = samples.${source.id};\n`;

	editor.focus();
	//execCommand inserts at the selection, so the selection is how you choose
	//where it goes
	editor.setSelectionRange(at, at);
	if (!document.execCommand?.('insertText', false, line)) {
		//no execCommand: keep the feature, lose the undo
		editor.value = editor.value.slice(0, at) + line + editor.value.slice(at);
		editor.setSelectionRange(at + line.length, at + line.length);
	}
	saveBuffer(editor.value);
}

async function useSource(id, size = null) {
	const source = SOURCES.find((entry) => entry.id === id);
	if (!source) return;

	currentElement?.stop?.();
	currentElement = null;

	try {
		const { element, live } = await openSource(source);
		currentElement = element;
		renderer.source(element, { live });

		//Before `setSourceSize`, which needs it to fill in the placeholders and to
		//work out the missing half of a one-sided request.
		naturalSize = naturalSizeOf(element);
		//A size asked for by a link travels with it; picking a source by hand
		//starts from that source's own size, because carrying the last one over
		//silently would resize a picture nobody asked to resize.
		setSourceSize(size);

		sourceLive = live;
		requestFrame();
	} catch (error) {
		reportError(error);
		return;
	}

	currentSourceId = id;
	markCurrentSource();
	updateShare();
}

// ---------------------------------------------------------------- resolution

/** What a source is before anything overrides it. */
function naturalSizeOf(element) {
	if (!element) return null;
	const width = element.naturalWidth || element.videoWidth || element.width || 0;
	const height = element.naturalHeight || element.videoHeight || element.height || 0;
	return width && height ? { width, height } : null;
}

/**
 * Reads the size at, or back to its own size for null.
 *
 * `Renderer.resolution` ignores a value it already has, so writing the current
 * one back is free - which matters, because the input fires on every step of a
 * spinner and each change would otherwise throw the whole chain's cache away.
 */
function setSourceSize(size) {
	sourceSize = size;
	renderer.resolution(size?.width ?? null, size?.height ?? null);
	showResolution();
}

function showResolution() {
	$('resWidth').placeholder = naturalSize?.width ?? '';
	$('resHeight').placeholder = naturalSize?.height ?? '';
	$('resWidth').value = sourceSize ? sourceSize.width : '';
	$('resHeight').value = sourceSize ? sourceSize.height : '';
	$('resReset').hidden = !sourceSize;
}

/**
 * The size the two boxes are asking for.
 *
 * Empty means the source's own. Filling in one and not the other means "this
 * wide", so the other follows the aspect ratio - typing a width and getting a
 * squashed picture would be a strange way to answer that.
 */
function readResolutionInputs() {
	const clamp = (value) => Math.min(8192, Math.max(1, Math.round(value)));
	const width = Number($('resWidth').value);
	const height = Number($('resHeight').value);

	if (!width && !height) return null;
	if (width && height) return { width: clamp(width), height: clamp(height) };

	const ratio = naturalSize ? naturalSize.width / naturalSize.height : 1;
	return width
		? { width: clamp(width), height: clamp(width / ratio) }
		: { width: clamp(height * ratio), height: clamp(height) };
}

function setUpResolution() {
	const apply = () => {
		setSourceSize(readResolutionInputs());
		updateShare();
		requestFrame();
	};

	//`change` rather than `input`: this re-reads the source and recomputes every
	//stage, and doing that per keystroke means the first digit of `1024` renders
	//a one-pixel frame.
	$('resWidth').addEventListener('change', apply);
	$('resHeight').addEventListener('change', apply);
	$('resReset').addEventListener('click', () => {
		$('resWidth').value = '';
		$('resHeight').value = '';
		apply();
	});
}

function markCurrentSource() {
	//`.source` rather than the children: each tile is a wrapper now, holding the
	//source button and, in code mode, its insert control.
	for (const button of $('sources').querySelectorAll('button.source')) {
		button.setAttribute('aria-pressed', String(button.dataset.id === currentSourceId));
	}
}

/** Every still image in the list, decoded, so a dual-input filter can use one. */
async function loadSecondFrames() {
	const scratch = document.createElement('canvas');
	const context = scratch.getContext('2d', { willReadFrequently: true });

	for (const source of SOURCES) {
		if (source.kind !== 'image' || secondFrames.has(source.id)) continue;
		const image = await loadImage(source.url);
		scratch.width = image.naturalWidth;
		scratch.height = image.naturalHeight;
		context.drawImage(image, 0, 0);
		secondFrames.set(source.id, context.getImageData(0, 0, scratch.width, scratch.height));
	}
}

function setUpDropzone() {
	const zone = $('dropzone');
	const input = $('fileInput');

	input.addEventListener('change', () => {
		if (input.files?.[0]) openFile(input.files[0]);
	});

	for (const type of ['dragenter', 'dragover']) {
		document.addEventListener(type, (event) => {
			event.preventDefault();
			zone.classList.add('over');
		});
	}
	for (const type of ['dragleave', 'drop']) {
		document.addEventListener(type, (event) => {
			event.preventDefault();
			if (event.type === 'drop' || event.target === zone) zone.classList.remove('over');
		});
	}
	document.addEventListener('drop', (event) => {
		const file = event.dataTransfer?.files?.[0];
		if (file) openFile(file);
	});
}

/**
 * A dropped file joins the source list for the rest of the session.
 *
 * Nothing is uploaded anywhere - the entry holds an object URL, so the file
 * never leaves the machine and the list empties itself when the tab closes.
 * Which does mean a link to a chain built on a dropped file will open on a
 * sample instead; there is nowhere else for it to point.
 */
async function openFile(file) {
	try {
		currentElement?.stop?.();
		const { element, live, spec } = await loadFile(file);
		const id = addSource(spec);

		currentElement = element;
		renderer.source(element, { live });
		currentSourceId = id;

		//a dropped file arrives at its own size, like any other source picked by hand
		naturalSize = naturalSizeOf(element);
		setSourceSize(null);

		buildSourceList();
		//a dropped still can be a second input like any other
		await loadSecondFrames();
		chainView.render(renderer.pipeline.filters, seconds);

		sourceLive = live;
		requestFrame();
		updateShare();
	} catch (error) {
		reportError(error);
	}
}

// ---------------------------------------------------------------- rendering

/**
 * This used to be a copy of `renderer.start()` - same rAF handle, same
 * idempotency guard - written out again only because the page wants to read
 * `renderer.stats` after every frame and the library's loop called back into
 * nothing. `onFrame` is that callback, so the loop goes back to the library.
 */
const startLoop = () => renderer.start();
const stopLoop = () => renderer.stop();

/**
 * Whether the picture changes on its own, from either end of the pipeline.
 *
 * A still source with an ordinary chain renders once and sits there, which is
 * why the loop is not simply always on. But a filter can be the moving part
 * instead - `Wave`, `DotCrawl`, `GradientMap` cycling - and those were frozen
 * on a still image, a wave that never waved, because the loop only ever asked
 * the *source* whether anything was going to change.
 *
 * `animated` and not `pure`: purity is a caching question and answers yes for
 * things that will never draw anything new, like a `Wave` parked at speed 0.
 */
function chainIsLive() {
	//`pipeline.animated` rather than a walk over `filters` here: a chain whose
	//only moving part is inside a second input has nothing animated at the top
	//level, and only the pipeline can see its own branches.
	return renderer.pipeline.animated;
}

/** Starts or stops the loop to match what the source and the chain need. */
function matchLoop(sourceIsLive) {
	if (sourceIsLive || chainIsLive()) {
		startLoop();
	} else {
		stopLoop();
	}
	return renderer.running;
}

/** One frame, now, unless the loop is already producing them. */
function requestFrame() {
	if (matchLoop(sourceLive)) return;
	renderer.invalidateSource();
	renderer.render();
	scheduleMeasure();
}

/**
 * How long a frame takes, for a source that only produces one.
 *
 * A still image renders once and then sits there, so "milliseconds for the
 * single render that happened to include shader compilation" is a number with
 * no meaning - it was the first thing on the page that was actively
 * misleading. Instead the chain is run repeatedly against the same frame and
 * the *median* reported, which is what a video of this size and this chain
 * would cost per frame.
 *
 * Median rather than mean: one GC pause in thirty runs moves a mean and does
 * not move a median. Debounced, so dragging a slider stays responsive and the
 * measurement happens once the value settles.
 */
let measureTimer = 0;
/**
 * Bumped whenever the picture changes, so a measurement still in flight can see
 * that it is timing something nobody is looking at any more and give up.
 */
let measureGeneration = 0;

/** Total work to spend on a measurement, and the longest it may block for. */
const MEASURE_BUDGET_MS = 250;
const MEASURE_SLICE_MS = 8;

function scheduleMeasure() {
	clearTimeout(measureTimer);
	measureGeneration++;
	if (renderer.running) {
		return;	//a live source produces real frames; those are the honest number
	}
	measureTimer = setTimeout(measure, 160);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Times the chain without the page showing it happening.
 *
 * Two things made the measurement visible, and both are the kind of thing you
 * only notice on the filters that make it obvious:
 *
 * - it used to finish by calling `render()` again, which for anything with a
 *   random or time-varying element drew a *different* picture. The frame you
 *   were looking at was replaced by another one a fraction of a second later,
 *   which reads as the image glitching. The canvas already holds a correct
 *   frame when this starts, so the fix is to leave it alone: nothing here draws.
 * - it ran its whole burst in one go. 250ms of straight-line work on the main
 *   thread is a quarter-second where nothing repaints and no input is handled,
 *   which reads as the page hanging. It runs in slices now, yielding to the
 *   browser between them, and spends its budget in *work* time so yielding does
 *   not cost it samples.
 */
async function measure() {
	const frame = renderer.sourceFrame;
	const filters = renderer.pipeline.filters;

	if (!frame || !filters.length) {
		setFrameTime(null);
		return;
	}

	const mine = measureGeneration;

	//a stateful filter would otherwise spend the burst accumulating a history of
	//the same frame over and over, and time something nobody asked for
	for (const filter of filters) filter.reset();

	const times = [];
	let spent = 0;
	const more = () => times.length < 30 && spent < MEASURE_BUDGET_MS;

	while (more()) {
		const sliceEnd = performance.now() + MEASURE_SLICE_MS;
		do {
			renderer.pipeline.invalidate();
			const at = performance.now();
			renderer.pipeline.run(frame);
			const took = performance.now() - at;
			times.push(took);
			spent += took;
		} while (more() && performance.now() < sliceEnd);

		await nextFrame();
		if (measureGeneration !== mine) {
			//the source, the chain or a property moved on; whoever changed it has
			//already scheduled a measurement of its own
			return;
		}
	}

	times.sort((a, b) => a - b);
	setFrameTime(times[times.length >> 1], times.length);

	//Put the pipeline back the way a fresh render expects to find it, but do not
	//draw: the canvas is showing the frame from before the burst, and redrawing
	//is exactly the flicker this is avoiding.
	for (const filter of filters) filter.reset();
	renderer.pipeline.invalidate();
}

function setFrameTime(ms, samples) {
	const el = $('mFrame');
	el.textContent = ms === null ? '—' : `${ms.toFixed(2)} ms`;
	el.title = ms === null
		? 'Add a filter to time the chain'
		: samples
			? `Median of ${samples} runs over the same frame`
			: 'Averaged over recent frames';
}

function showStats(output) {
	const stats = renderer.stats;
	const stages = renderer.pipeline.length;

	const backend = stages === 0 ? (renderer.gpu && renderer.usingGPU ? 'gpu' : 'cpu') : stats.backend;
	const badge = $('backendBadge');
	badge.textContent = backend === 'gpu' ? 'GPU' : backend === 'mixed' ? 'Mixed' : 'CPU';
	badge.classList.toggle('cpu', backend !== 'gpu');
	badge.disabled = renderer.gpu && !renderer.usingGPU;
	badge.title = badge.disabled
		? 'No WebGL2 here, so the CPU implementations are the only option'
		: renderer.gpu
			? 'Running as shaders. Click to force the CPU path.'
			: 'Forced onto the CPU path. Click to use shaders.';

	$('mBackend').textContent = badge.textContent;
	if (renderer.running) {
		//a live source: an exponential average, because a per-frame number is
		//unreadable and every frame is a real one
		smoothedFrameTime = smoothedFrameTime ? smoothedFrameTime * 0.9 + stats.total * 0.1 : stats.total;
		setFrameTime(stages ? smoothedFrameTime : null);
	}
	$('mSize').textContent = `${output.width} × ${output.height}`;
	$('mStages').textContent = stats.fallbacks.length
		? `${stages} (${stats.fallbacks.length} on CPU)`
		: String(stages);

	$('stageEmpty').hidden = stages > 0;
}

// ---------------------------------------------------------------- benchmark

/**
 * Runs the same chain both ways and reports the difference.
 *
 * The most persuasive argument for the shader backend is an honest number, so
 * this builds a second pipeline with `gpu: false` from the *same* filter
 * instances and times both over a fixed number of frames. Stateful filters get
 * their history reset between runs, which is what `reset()` is for.
 */
async function benchmark() {
	const filters = renderer.pipeline.filters;
	const result = $('benchResult');

	if (!filters.length || !renderer.sourceFrame) {
		result.hidden = false;
		result.textContent = 'Add a filter first.';
		return;
	}

	result.hidden = false;
	result.textContent = 'Measuring…';
	await new Promise((resolve) => setTimeout(resolve, 30));

	const FRAMES = 24;
	const time = (usingGPU) => {
		const pipeline = new Pipeline([], { gpu: usingGPU });
		for (const filter of filters) {
			filter.reset();
			pipeline.add(filter, stageOptions(filter));
		}

		pipeline.run(renderer.sourceFrame);	//once to compile shaders and warm caches
		const started = performance.now();
		for (let i = 0; i < FRAMES; i++) {
			pipeline.invalidate();
			pipeline.run(renderer.sourceFrame);
		}
		const each = (performance.now() - started) / FRAMES;

		const backend = pipeline.stats.backend;
		pipeline.dispose();
		return { each, backend };
	};

	const cpu = time(false);
	const gpu = time(true);

	//restore whatever the page was actually showing
	for (const filter of filters) filter.reset();
	rebuildStages();
	requestFrame();

	const size = `${renderer.sourceFrame.width}×${renderer.sourceFrame.height}`;
	if (gpu.backend === 'cpu') {
		result.textContent = `No WebGL2 here, so both paths are the CPU one: ${cpu.each.toFixed(1)} ms per frame at ${size}.`;
		return;
	}

	const ratio = cpu.each / gpu.each;
	result.textContent =
		`${size}, ${filters.length} filter${filters.length === 1 ? '' : 's'}: ` +
		`CPU ${cpu.each.toFixed(1)} ms, GPU ${gpu.each.toFixed(1)} ms — ${ratio.toFixed(1)}× faster. ` +
		`The GPU figure includes the upload and readback at each end, which a chain rendering straight to a canvas would not pay.`;
}

// ---------------------------------------------------------------- code panel

function updateCode() {
	const filters = renderer.pipeline.filters;

	if (!filters.length) {
		$('code').textContent = "import { Renderer } from '@calrk/clarity';\n\nconst renderer = new Renderer(canvas)\n\t.source(image);\n\nrenderer.render();";
		return;
	}

	const names = [...new Set(filters.map((filter) => filter.constructor.name))].sort();
	const lines = [`import { Renderer, ${names.join(', ')} } from '@calrk/clarity';`, ''];
	lines.push('const renderer = new Renderer(canvas)');
	lines.push('\t.source(image)');

	for (const filter of filters) {
		const name = filter.constructor.name;
		const options = [];

		for (const [key, spec] of Object.entries(filter.schema)) {
			const value = filter.getProperty(key);
			if (value === spec.default) continue;
			options.push(`${key}: ${typeof value === 'string' ? `'${value}'` : value}`);
		}
		if (!filter.enabled) options.push('enabled: false');

		const second = seconds.get(filter);
		const stage = second && second !== 'source' ? `, { second: ${second}Frame }` : '';
		lines.push(`\t.add(new ${name}(${options.length ? `{ ${options.join(', ')} }` : ''})${stage})`);
	}

	lines[lines.length - 1] += ';';
	lines.push('', 'renderer.start();');
	$('code').textContent = lines.join('\n');
}

// ---------------------------------------------------------------- share

function updateShare() {
	//The hash describes the *built* chain. A snippet is not shareable - there is
	//no safe way to run one that arrived in a link - so code mode leaves the URL
	//saying whatever the Build tab last said, and switching back finds it intact.
	if (mode !== 'build') return;
	history.replaceState(
		null,
		'',
		writeHash(currentSourceId ?? 'custom', buildPipeline.filters, sourceSize)
	);
}

/**
 * Rebuilds the whole page from the URL.
 *
 * Also wired to `hashchange`, because pasting a link into the address bar of an
 * already-open page is a *same-document* navigation - nothing reloads, and
 * without this the link silently did nothing, which is the one way a shareable
 * link must not fail. `updateShare` uses `replaceState`, which does not fire
 * the event, so the page cannot loop on its own writes.
 */
async function loadFromHash() {
	const { source, size, filters } = readHash();

	//`buildPipeline` rather than the renderer, which in code mode is pointed at a
	//snippet's chain - clearing that would throw away what is on screen in
	//response to a hash the Build tab owns.
	buildPipeline.clear();
	seconds.clear();

	for (const filter of filters) {
		if (isDualInput(filter.constructor.name)) {
			seconds.set(filter, 'source');
		}
		buildPipeline.add(filter, stageOptions(filter));
	}

	const wanted = SOURCES.some((entry) => entry.id === source) ? source : SOURCES[0].id;
	if (wanted !== currentSourceId) {
		await useSource(wanted, size);
	} else {
		//same picture, and the link may still be asking for it at another size -
		//`useSource` would reopen a webcam or restart a video for nothing
		setSourceSize(size);
	}

	if (mode === 'build') sync();
}

// ---------------------------------------------------------------- code mode

/**
 * A Pipeline sharing this page's one GL context.
 *
 * The options are read fresh on every construction rather than captured, so a
 * snippet run after the backend badge is clicked gets the current answer.
 * Sharing the backend is what stops each run - and each branch inside a run -
 * opening its own WebGL context.
 */
const ScopedPipeline = bindPipeline(() => ({
	backend: buildPipeline.backend,
	gpu: gpuWanted
}));

const ScopedRenderer = bindRenderer(renderer, ScopedPipeline);

/**
 * What a snippet can see, rebuilt per run.
 *
 * `image` is whatever source is selected right now, so it cannot be captured
 * once - and building the scope is a few dozen property reads against a run
 * that is about to compile and execute JavaScript, so there is nothing to save
 * by being clever about it.
 */
function currentScope() {
	return buildScope(ScopedPipeline, ScopedRenderer, {
		canvas: $('canvas'),
		image: currentElement ?? renderer.sourceFrame,
		samples: sampleFrames()
	});
}

/**
 * Every still source, as pixels, by id - so a snippet can compose two pictures
 * without either being the one that is selected.
 *
 * Stills only, and not for want of trying: the page holds one video element at
 * a time, so a video that is not the current source has no frame to hand out.
 * The selected one is reachable as `frameOf(image)`, and inside a function if
 * it should be re-read every render rather than frozen at the moment Run was
 * pressed.
 *
 * Built per run off `secondFrames`, which is already decoded for the Build
 * tab's second-input picker - and which `openFile` refreshes, so a dropped
 * image turns up here too.
 */
function sampleFrames() {
	return Object.fromEntries(secondFrames);
}

function buildSnippetList() {
	const picker = $('snippetPicker');
	for (const snippet of SNIPPETS) {
		const option = document.createElement('option');
		option.value = snippet.id;
		option.textContent = `${snippet.label} — ${snippet.note}`;
		picker.append(option);
	}

	picker.addEventListener('change', () => {
		const snippet = SNIPPETS.find((entry) => entry.id === picker.value);
		if (!snippet) return;
		$('snippet').value = snippet.source;
		picker.value = '';
		runCode();
	});
}

/**
 * Runs what is in the editor, and renders it if it worked.
 *
 * A failure leaves the previous chain on screen rather than blanking the
 * canvas. A snippet is a thing being written, so half-finished is its normal
 * state, and losing the picture on every keystroke-triggered run would make the
 * error message the only feedback there is.
 */
function runCode() {
	const source = $('snippet').value;
	saveBuffer(source);

	//`new Renderer(...)` points the page at a fresh chain as it is constructed,
	//so a snippet that throws half way through has already replaced what was on
	//screen with whatever it managed to build. Remembering the chain lets a
	//failure put the last working picture back.
	const before = renderer.pipeline;
	const result = runSnippet(source, currentScope());
	const error = $('snippetError');

	if (result.error) {
		error.hidden = false;
		error.textContent = result.error;
		if (renderer.pipeline !== before) {
			renderer.pipeline.dispose();
			renderer.use(before);
			requestFrame();
		}
		return false;
	}

	error.hidden = true;
	error.textContent = '';

	const previous = codePipeline;
	codePipeline = result.pipeline;
	//`gpu` is not forced here: the binding already applies the page's preference
	//as a default, and overwriting it would silently undo a snippet that asked
	//for `{ gpu: false }` on purpose. The badge still overrides, because that is
	//somebody deciding rather than a default being applied.
	//
	//a no-op when the snippet declared a Renderer, since that wired it up as it
	//was constructed - and the whole job when it returned a bare Pipeline
	renderer.use(codePipeline);

	//`use` deliberately leaves the outgoing chain alone, because it cannot know
	//who else holds it. This one is ours and nothing else will free it - and it
	//borrows the page's context, so disposing it releases the caches without
	//touching the GL context the next run needs.
	if (previous && previous !== codePipeline) {
		previous.dispose();
	}

	smoothedFrameTime = 0;
	requestFrame();
	return true;
}

function setMode(next) {
	if (next === mode) return;
	mode = next;

	document.body.dataset.mode = next;
	$('modeBuild').setAttribute('aria-pressed', String(next === 'build'));
	$('modeCode').setAttribute('aria-pressed', String(next === 'code'));

	if (next === 'build') {
		renderer.use(buildPipeline);
		sync();
		return;
	}

	//An empty buffer on first visit is a blank page with no clue what to type
	if (!$('snippet').value.trim()) {
		$('snippet').value = DEFAULT_SNIPPET.source;
	}
	if (!runCode()) {
		//the snippet is broken, so there is nothing to render - but the canvas is
		//still showing the built chain, which would be a lie about what is running
		renderer.use(codePipeline ?? new ScopedPipeline());
		requestFrame();
	}
}

function setUpEditor() {
	const editor = $('snippet');

	editor.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			runCode();
			return;
		}
		//Tab indents rather than leaving the field. Escape first, so the editor is
		//never a keyboard trap - which is the reason browsers make Tab do that.
		if (event.key === 'Tab' && !event.shiftKey) {
			event.preventDefault();
			const { selectionStart: from, selectionEnd: to, value } = editor;
			editor.value = `${value.slice(0, from)}\t${value.slice(to)}`;
			editor.selectionStart = editor.selectionEnd = from + 1;
		}
	});

	//so a reload does not lose work even if the snippet was never run
	editor.addEventListener('input', () => saveBuffer(editor.value));

	$('runSnippet').addEventListener('click', () => runCode());
	$('resetSnippet').addEventListener('click', () => {
		editor.value = DEFAULT_SNIPPET.source;
		runCode();
	});
}

// ---------------------------------------------------------------- glue

function sync() {
	chainView.render(renderer.pipeline.filters, seconds);
	$('chainHint').hidden = renderer.pipeline.length > 0;
	//shown only when there is something to roll, so it is never a dead control
	$('rerollButton').hidden = seeded().length === 0;
	updateCode();
	updateShare();
	requestFrame();
}

function reportError(error) {
	const result = $('benchResult');
	result.hidden = false;
	result.textContent = String(error.message ?? error);
}

async function copy(text, button) {
	const original = button.textContent;
	try {
		await navigator.clipboard.writeText(text);
		button.textContent = 'Copied';
	} catch {
		button.textContent = 'Press ⌘C';
	}
	setTimeout(() => (button.textContent = original), 1400);
}

function setUpTheme() {
	const stored = localStorage.getItem('clarity-theme');
	if (stored) document.documentElement.dataset.theme = stored;

	$('themeToggle').addEventListener('click', () => {
		const dark = matchMedia('(prefers-color-scheme: dark)').matches;
		const current = document.documentElement.dataset.theme ?? (dark ? 'dark' : 'light');
		const next = current === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = next;
		localStorage.setItem('clarity-theme', next);
	});
}

async function start() {
	setUpTheme();
	buildPalette();
	buildSourceList();
	buildPresetList();
	buildSnippetList();
	setUpDropzone();
	setUpEditor();
	setUpResolution();

	document.body.dataset.mode = 'build';
	$('snippet').value = loadBuffer() || DEFAULT_SNIPPET.source;
	$('modeBuild').addEventListener('click', () => setMode('build'));
	$('modeCode').addEventListener('click', () => setMode('code'));

	$('paletteSearch').addEventListener('input', (event) => buildPalette(event.target.value));
	$('clearChain').addEventListener('click', () => {
		renderer.clear();
		seconds.clear();
		sync();
	});
	//one button for the whole chain, because with two Clouds in it you almost
	//always mean both - the per-card roll is there for when you do not
	$('rerollButton').addEventListener('click', () => reroll(seeded()));
	$('benchButton').addEventListener('click', benchmark);
	$('backendBadge').addEventListener('click', () => {
		gpuWanted = !gpuWanted;
		//both chains, so switching modes does not switch backend with it
		buildPipeline.gpu = gpuWanted;
		if (codePipeline) codePipeline.gpu = gpuWanted;
		smoothedFrameTime = 0;
		requestFrame();
	});
	$('copyCode').addEventListener('click', (event) => copy($('code').textContent, event.target));
	$('copyLink').addEventListener('click', (event) => copy(location.href, event.target));

	await loadSecondFrames();
	await loadFromHash();

	addEventListener('hashchange', loadFromHash);
}

start();
