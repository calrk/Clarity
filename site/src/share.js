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

/**
 * The source segment carries an optional size: `landscape@640x640`.
 *
 * Written only when it differs from what the source is anyway, so an ordinary
 * link stays short and stays correct if a sample is ever replaced with one of
 * another size. `@` and `x` rather than more separators, so it reads as a
 * dimension at a glance - which is the same reason the chain uses `,` and `=`
 * rather than being compact.
 *
 * @returns {{ source: string|null, size: {width: number, height: number}|null,
 *             filters: import('@calrk/clarity').Filter[] }}
 */
export function readHash(hash = location.hash) {
	const parts = hash.replace(/^#/, '').split(SEPARATOR).filter(Boolean);
	if (!parts.length) {
		return { source: null, size: null, filters: [] };
	}

	// the first segment is the source only if it is not a filter name
	const head = CATALOGUE[parts[0].split(/[,!]/)[0]] ? null : parts.shift();
	const match = head?.match(/^(.*?)@(\d+)x(\d+)$/);

	return {
		source: match ? match[1] : head,
		size: match ? { width: Number(match[2]), height: Number(match[3]) } : null,
		filters: buildChain(parts.join(SEPARATOR))
	};
}

export function writeHash(sourceId, filters, size = null) {
	const chain = formatChain(filters);
	const head = size ? `${sourceId}@${size.width}x${size.height}` : sourceId;
	return '#' + (chain ? `${head}${SEPARATOR}${chain}` : head);
}
