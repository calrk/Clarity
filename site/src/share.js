// The chain, in a URL.
//
// Cheap, and disproportionately good for showing the thing off: a link
// reproduces an exact filter stack, so "look what this does" is one paste
// rather than a screenshot and a description.
//
// The format is deliberately readable rather than compact - `Blur.radius=8` is
// something you can edit by hand in the address bar, and the whole point is
// that people play with it:
//
//   #photo/Desaturate/Blur.radius=8/EdgeDetector.fast=1!off
//
// Values go back in as strings, which is exactly what `setProperty` is built to
// take - it coerces per the schema. A hand-mangled value is clamped rather than
// throwing, so a bad link degrades to a working page.

import { CATALOGUE } from '@calrk/clarity';

const SEPARATOR = '/';

/** @returns {{ source: string|null, stages: {name: string, options: object, enabled: boolean}[] }} */
export function readHash(hash = location.hash) {
	const parts = hash.replace(/^#/, '').split(SEPARATOR).filter(Boolean);
	if (!parts.length) {
		return { source: null, stages: [] };
	}

	// the first segment is the source only if it is not a filter name
	const source = CATALOGUE[parts[0].split(/[.!]/)[0]] ? null : parts.shift();
	const stages = [];

	for (const part of parts) {
		const enabled = !part.endsWith('!off');
		const body = enabled ? part : part.slice(0, -4);
		const [name, ...pairs] = body.split('.');

		if (!CATALOGUE[name]) {
			continue;	//a filter that has been renamed or removed, not a reason to fail
		}

		const options = {};
		for (const pair of pairs) {
			const at = pair.indexOf('=');
			if (at > 0) {
				options[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1));
			}
		}
		stages.push({ name, options, enabled });
	}

	return { source, stages };
}

/**
 * Only properties that differ from the filter's defaults are written, so a
 * default chain gives a short link and the link stays stable when a default
 * changes underneath it.
 */
export function writeHash(sourceId, filters) {
	const parts = [sourceId];

	for (const filter of filters) {
		const name = filter.constructor.name;
		let part = name;

		for (const [key, spec] of Object.entries(filter.schema)) {
			const value = filter.getProperty(key);
			if (value === spec.default) {
				continue;
			}
			//only the value is escaped. Escaping the whole segment would turn every
			//`=` into %3D, and a link nobody can read is a link nobody edits - which
			//was the point of choosing a readable format over a compact one
			part += `.${key}=${value === null ? '' : encodeURIComponent(value)}`;
		}
		if (!filter.enabled) {
			part += '!off';
		}
		parts.push(part);
	}

	return '#' + parts.join(SEPARATOR);
}
