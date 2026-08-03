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
import { readHash, writeHash } from './share.js';
import { SOURCES, addSource, loadFile, loadImage, openSource } from './sources.js';
import './styles.css';

const $ = (id) => document.getElementById(id);

const canvas = $('canvas');
const renderer = new Renderer(canvas);

/** Second-input frames for the dual-input filters, by stage. */
const seconds = new Map();
/** Source frames the dual-input filters can choose between. */
let secondFrames = new Map();

let currentSourceId = null;
/** The live element, so a camera or video can be shut down when replaced. */
let currentElement = null;
let smoothedFrameTime = 0;

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
	}
});

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

// ---------------------------------------------------------------- sources

function buildSourceList() {
	const list = $('sources');
	list.replaceChildren();

	for (const source of SOURCES) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'source';
		button.dataset.id = source.id;
		button.title = source.label;
		button.setAttribute('aria-pressed', String(source.id === currentSourceId));

		if (source.thumb) {
			const img = document.createElement('img');
			img.src = source.thumb;
			img.alt = '';
			button.appendChild(img);
		} else {
			const glyph = document.createElement('span');
			glyph.className = 'glyph';
			glyph.textContent = source.glyph ?? '▦';
			button.appendChild(glyph);
		}

		const label = document.createElement('span');
		label.className = 'label';
		label.textContent = source.label;
		button.appendChild(label);

		button.addEventListener('click', () => useSource(source.id));
		list.appendChild(button);
	}
}

async function useSource(id) {
	const source = SOURCES.find((entry) => entry.id === id);
	if (!source) return;

	currentElement?.stop?.();
	currentElement = null;

	try {
		const { element, live } = await openSource(source);
		currentElement = element;
		renderer.source(element, { live });

		if (live) {
			startLoop();
		} else {
			stopLoop();
			requestFrame();
		}
	} catch (error) {
		reportError(error);
		return;
	}

	currentSourceId = id;
	markCurrentSource();
	updateShare();
}

function markCurrentSource() {
	for (const button of $('sources').children) {
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

		buildSourceList();
		//a dropped still can be a second input like any other
		await loadSecondFrames();
		chainView.render(renderer.pipeline.filters, seconds);

		if (live) {
			startLoop();
		} else {
			stopLoop();
			requestFrame();
		}
		updateShare();
	} catch (error) {
		reportError(error);
	}
}

// ---------------------------------------------------------------- rendering

/**
 * The frame loop lives here rather than in `renderer.start()` because the page
 * wants to read `renderer.stats` after every frame, and the library's loop
 * quite reasonably does not call back into anything.
 */
let loop = 0;

function startLoop() {
	if (loop) return;
	const tick = () => {
		loop = requestAnimationFrame(tick);
		draw();
	};
	loop = requestAnimationFrame(tick);
}

function stopLoop() {
	if (loop) {
		cancelAnimationFrame(loop);
		loop = 0;
	}
}

/** One frame, now, unless the loop is already producing them. */
function requestFrame() {
	if (loop) return;
	renderer.invalidateSource();
	draw();
	scheduleMeasure();
}

function draw() {
	const output = renderer.render();
	if (output) showStats(output);
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

function scheduleMeasure() {
	clearTimeout(measureTimer);
	if (loop) {
		return;	//a live source produces real frames; those are the honest number
	}
	measureTimer = setTimeout(measure, 160);
}

function measure() {
	const frame = renderer.sourceFrame;
	const filters = renderer.pipeline.filters;

	if (!frame || !filters.length) {
		setFrameTime(null);
		return;
	}

	//a stateful filter would otherwise spend the burst accumulating a history of
	//the same frame over and over, and time something nobody asked for
	for (const filter of filters) filter.reset();

	const times = [];
	const deadline = performance.now() + 250;
	while (times.length < 30 && performance.now() < deadline) {
		renderer.pipeline.invalidate();
		const at = performance.now();
		renderer.pipeline.run(frame);
		times.push(performance.now() - at);
	}

	times.sort((a, b) => a - b);
	setFrameTime(times[times.length >> 1], times.length);

	for (const filter of filters) filter.reset();
	renderer.pipeline.invalidate();
	draw();
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
	if (loop) {
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
	history.replaceState(null, '', writeHash(currentSourceId ?? 'custom', renderer.pipeline.filters));
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
	const { source, filters } = readHash();

	renderer.clear();
	seconds.clear();

	for (const filter of filters) {
		if (isDualInput(filter.constructor.name)) {
			seconds.set(filter, 'source');
		}
		renderer.add(filter, stageOptions(filter));
	}

	const wanted = SOURCES.some((entry) => entry.id === source) ? source : SOURCES[0].id;
	if (wanted !== currentSourceId) {
		await useSource(wanted);
	}

	sync();
}

// ---------------------------------------------------------------- glue

function sync() {
	chainView.render(renderer.pipeline.filters, seconds);
	$('chainHint').hidden = renderer.pipeline.length > 0;
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
	setUpDropzone();

	$('paletteSearch').addEventListener('input', (event) => buildPalette(event.target.value));
	$('clearChain').addEventListener('click', () => {
		renderer.clear();
		seconds.clear();
		sync();
	});
	$('benchButton').addEventListener('click', benchmark);
	$('backendBadge').addEventListener('click', () => {
		renderer.gpu = !renderer.gpu;
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
