// A chain written rather than assembled.
//
// The drag list can only describe one linear pipeline, because that is the only
// shape a list has. The library has never been limited that way -
// `StageOptions.second` takes an ImageData, a function, or a whole Pipeline, so
// chains have always composed - there was simply nowhere in the UI to say so.
// This is that place, and reaching a capability that already exists is the
// reason it is worth having rather than a second way to do the same thing.
//
// Deliberately not sandboxed. A snippet is run with `new Function` in this page,
// which would be indefensible if code could arrive from a URL - a shared link
// executing a stranger's JavaScript on this origin is the whole reason
// playgrounds use a null-origin iframe. Nothing here is shareable: the buffer
// holds what you typed or an example that shipped with the page, and it goes no
// further than localStorage. If sharing is ever added, `runSnippet` is the one
// function that has to move into a frame.

import * as CLARITY from '@calrk/clarity';
import { FILTERS } from '@calrk/clarity';

const STORAGE_KEY = 'clarity:snippet';

/**
 * What a snippet can reach, built from the registry rather than listed here.
 *
 * The playground's rule, applied to the code panel: if adding a filter to the
 * library meant editing this file, the metadata would not be carrying its
 * weight. `FILTERS` is the same map the chain parser uses, so a filter is in
 * scope the moment it is exported.
 *
 * `Pipeline` is the one thing that is *not* the library's own. See below.
 */
export function buildScope(Pipeline, Renderer, extras = {}) {
	const scope = {};

	for (const [name, constructor] of Object.entries(FILTERS)) {
		//a name that is not an identifier cannot be a function parameter, and
		//every filter's is - but a typo in the registry should not take the whole
		//panel down with a SyntaxError nobody can locate
		if (/^[A-Za-z_$][\w$]*$/.test(name)) {
			scope[name] = constructor;
		}
	}

	return {
		...scope,
		Pipeline,
		Renderer,
		//The handful of non-filter exports a snippet has a use for.
		CLARITY,
		Operations: CLARITY.Operations,
		Pixel: CLARITY.Pixel,
		seededRandom: CLARITY.seededRandom,
		createImageData: CLARITY.createImageData,
		cloneImageData: CLARITY.cloneImageData,
		medianCut: CLARITY.medianCut,
		nearestColourIndex: CLARITY.nearestColourIndex,
		hash32: CLARITY.hash32,
		hashedRandom: CLARITY.hashedRandom,
		//so a chain string from the Build tab can be dropped straight in
		buildChain: CLARITY.buildChain,
		CATALOGUE: CLARITY.CATALOGUE,
		frameOf,
		...extras
	};
}

/**
 * A Pipeline bound to one GL context.
 *
 * A browser allows only a handful of live WebGL contexts, and every
 * `new Pipeline()` opens its own on first use. A snippet run twenty times, each
 * building a chain and a branch or two, exhausts them - and the failure is not
 * an error, it is the oldest contexts being silently killed and chains going
 * black. Sharing the page's backend means the count never goes above one.
 *
 * Subclassed rather than wrapped in a factory so `new Pipeline([...])` in a
 * snippet is the same expression it would be in an application, and so
 * `instanceof` still holds. Anything the snippet passes explicitly wins, because
 * someone writing out an option has thought about it.
 *
 * @param defaults returns the PipelineOptions to build every snippet chain with
 */
export function bindPipeline(defaults) {
	return class Pipeline extends CLARITY.Pipeline {
		constructor(filters = [], options = {}) {
			//`defaults()` is called per construction rather than captured, so a
			//snippet run after the backend badge is clicked gets the current answer
			super(filters, { ...defaults(), ...options });
		}
	};
}

/**
 * Any source as an ImageData, whatever it started as.
 *
 * The second input of a two-input filter has to be pixels. A still already is
 * one; a video or a webcam is an element with a *current* frame, so it has to
 * be drawn and read back, and the answer is only good for as long as the frame
 * on screen. That is why a live source belongs in a function - `{ second: () =>
 * frameOf(video) }` re-reads it every render where `{ second: frameOf(video) }`
 * freezes the moment you pressed Run. Both are legitimate; the difference is
 * worth being able to say.
 *
 * One scratch canvas for the module rather than one per call: allocating a
 * canvas per frame is how you make a compositing chain stutter.
 */
let scratch = null;

export function frameOf(input) {
	if (!input) {
		throw new Error('frameOf() needs an image, a video, a canvas or an ImageData');
	}
	//already pixels - including anything from `samples`, which is the common case
	if (typeof input.data === 'object' && typeof input.width === 'number') {
		return input;
	}

	const width = input.naturalWidth ?? input.videoWidth ?? input.width;
	const height = input.naturalHeight ?? input.videoHeight ?? input.height;
	if (!width || !height) {
		//a video before its metadata arrives, which is a wait rather than a fault
		throw new Error('that source has no frame yet - it may still be loading');
	}

	scratch ??= document.createElement('canvas');
	const context = scratch.getContext('2d', { willReadFrequently: true });
	if (scratch.width !== width || scratch.height !== height) {
		scratch.width = width;
		scratch.height = height;
	}
	context.drawImage(input, 0, 0);
	return context.getImageData(0, 0, width, height);
}

/**
 * `new Renderer(canvas)`, wired to the one this page is already driving.
 *
 * The point of the panel is that a snippet is the code you would write in an
 * application, and in an application you declare a Renderer - it is the first
 * line of the README and of the snippet the Build tab prints. Requiring a bare
 * Pipeline instead made the playground print a form it would not accept.
 *
 * So the snippet gets to write that line, and what it gets back is the page's
 * renderer rather than a second one. A real second Renderer over the same
 * canvas would be two frame loops fighting over one 2d context, and the source
 * list, the readout and the benchmark all reach for a specific instance -
 * pointing them at a different object on every run is a lot of moving parts for
 * a difference nobody can see.
 *
 * A plain function rather than a class because `new` on a function that returns
 * an object hands back that object, so both `new Renderer(canvas)` and
 * `Renderer()` do the same sensible thing.
 *
 * The `target` argument is accepted and ignored: there is one canvas on the
 * page, and drawing to another would draw to nothing.
 */
export function bindRenderer(page, Pipeline) {
	return function Renderer(_target, options = {}) {
		//A fresh chain per construction, so re-running a snippet starts clean
		//rather than appending to what the last run left behind.
		page.use(new Pipeline([], options));
		return page;
	};
}

/**
 * Runs a snippet and hands back the Pipeline it returned.
 *
 * Never throws: a snippet is a thing being written, so being half-finished is
 * its normal state and an exception is a message rather than a failure. The
 * caller keeps rendering whatever it had.
 *
 * @returns {{ pipeline: CLARITY.Pipeline } | { error: string }}
 */
export function runSnippet(source, scope) {
	const names = Object.keys(scope);
	const values = names.map((name) => scope[name]);

	let factory;
	try {
		factory = new Function(...names, `'use strict';\n${source}\n`);
	} catch (error) {
		//a SyntaxError from the parse, which is most of what you hit while typing
		return { error: describe(error) };
	}

	let result;
	try {
		result = factory(...values);
	} catch (error) {
		return { error: describe(error) };
	}

	if (result === undefined) {
		return {
			error: 'Nothing was returned. End the snippet with `return renderer;`.'
		};
	}

	//Both shapes are accepted, and normalised to the chain, because that is the
	//only thing the caller has to do anything with. A Renderer has already wired
	//itself up on the way past - see bindRenderer - so this is really asking
	//"which chain did the snippet end up describing".
	//
	//Forgiving in the reading direction on purpose, the way parseChain is: a bare
	//Pipeline is a perfectly clear thing to have written, and refusing it would
	//be pedantry rather than a rule anyone benefits from.
	if (result instanceof CLARITY.Renderer) {
		return { pipeline: result.pipeline };
	}
	if (result instanceof CLARITY.Pipeline) {
		return { pipeline: result };
	}

	return {
		error:
			`Expected a Renderer or a Pipeline, got ${label(result)}. ` +
			'A snippet ends with `return renderer;`.'
	};
}

function describe(error) {
	if (!(error instanceof Error)) {
		return `Thrown: ${label(error)}`;
	}
	//The name is worth keeping - ReferenceError reads as a typo and TypeError as
	//a wrong argument, which is most of the diagnosis before you read the message.
	return `${error.name}: ${error.message}`;
}

function label(value) {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	//the likeliest mistake by a distance: returning the last filter, because
	//`add` looks like it should hand one back the way `push` does not
	if (value instanceof CLARITY.Filter) {
		const name = value.constructor.name;
		return `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name} filter`;
	}
	return typeof value;
}

// ------------------------------------------------------------- persistence

export function loadBuffer() {
	try {
		return localStorage.getItem(STORAGE_KEY) ?? '';
	} catch {
		//private mode, or storage disabled. The panel still works, it just forgets.
		return '';
	}
}

export function saveBuffer(source) {
	try {
		localStorage.setItem(STORAGE_KEY, source);
	} catch {
		//nothing to be done, and nothing worth interrupting anyone over
	}
}
