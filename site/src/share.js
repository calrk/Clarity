// The chain, in a URL.
//
// Cheap, and disproportionately good for showing the thing off: a link
// reproduces an exact filter stack, so "look what this does" is one paste
// rather than a screenshot and a description.
//
//   #photo/Desaturate/Blur,radius=8/EdgeDetector,fast=1!off
//
// The format itself lives in the library - `parseChain` / `formatChain` - and
// is shared with the `clarity=""` attribute the Svelte action reads. All this
// adds is the source name on the front, which only the playground has a use
// for.

import { CATALOGUE, buildChain, formatChain } from '@calrk/clarity';

const SEPARATOR = '/';

/** @returns {{ source: string|null, filters: import('@calrk/clarity').Filter[] }} */
export function readHash(hash = location.hash) {
	const parts = hash.replace(/^#/, '').split(SEPARATOR).filter(Boolean);
	if (!parts.length) {
		return { source: null, filters: [] };
	}

	// the first segment is the source only if it is not a filter name
	const source = CATALOGUE[parts[0].split(/[,!]/)[0]] ? null : parts.shift();

	return { source, filters: buildChain(parts.join(SEPARATOR)) };
}

export function writeHash(sourceId, filters) {
	const chain = formatChain(filters);
	return '#' + (chain ? `${sourceId}${SEPARATOR}${chain}` : sourceId);
}
