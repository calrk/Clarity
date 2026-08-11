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
export function buildScope(Pipeline, extras = {}) {
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
		//The handful of non-filter exports a snippet has a use for. Renderer is
		//deliberately absent: the harness owns the canvas and the frame loop, and
		//a second one drawing to nothing is a confusing thing to be able to make.
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
			error: 'Nothing was returned. End the snippet with `return` and a Pipeline.'
		};
	}
	if (!(result instanceof CLARITY.Pipeline)) {
		return {
			error: `Expected a Pipeline, got ${label(result)}. Filters go inside one: \`return new Pipeline([ ... ])\`.`
		};
	}

	return { pipeline: result };
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
	if (value instanceof CLARITY.Filter) return `a ${value.constructor.name} filter`;
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
