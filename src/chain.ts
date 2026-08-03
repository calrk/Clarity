import { FILTERS } from './registry.js';
import type { Filter } from './core/Filter.js';

/**
 * A filter chain, as text.
 *
 *     Desaturate/Blur,radius=8/Invert!off
 *
 * Filters are separated by `/`, properties from their filter and from each
 * other by `,`, and a trailing `!off` means the filter is present but bypassed.
 * Values are URL-escaped; nothing else is, so the whole thing stays legible in
 * an address bar or an HTML attribute - which is the point. A format nobody can
 * read by eye is a format nobody edits.
 *
 * Properties are comma-separated rather than dot-separated because a dot is
 * also a decimal point: `Desaturate.amount=0.4` splits into three pieces and
 * silently becomes `amount=0`.
 *
 * Deliberately forgiving in one direction and strict in the other. Reading is
 * forgiving: an unknown filter or property is skipped rather than thrown,
 * because the text usually comes from a URL or an attribute written against a
 * different version of the library, and a page that renders the rest of the
 * chain beats a page that renders nothing. Writing is exact.
 */

const FILTER_SEPARATOR = '/';
const PROPERTY_SEPARATOR = ',';
const BYPASSED = '!off';

export interface ChainStage {
	name: string;
	options: Record<string, string>;
	enabled: boolean;
}

/** Text to stage descriptions, without constructing anything. */
export function parseChain(spec: string): ChainStage[] {
	const stages: ChainStage[] = [];

	for (const part of spec.split(FILTER_SEPARATOR)) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}

		const enabled = !trimmed.endsWith(BYPASSED);
		const body = enabled ? trimmed : trimmed.slice(0, -BYPASSED.length);
		const [name, ...pairs] = body.split(PROPERTY_SEPARATOR);

		if (!FILTERS[name]) {
			continue;	//renamed, removed, or a typo - not a reason to fail
		}

		const options: Record<string, string> = {};
		for (const pair of pairs) {
			const at = pair.indexOf('=');
			if (at > 0) {
				options[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1));
			}
		}

		stages.push({ name, options, enabled });
	}

	return stages;
}

/**
 * Text to filters, ready to add to a pipeline.
 *
 * Properties go in through `setProperty`, so they are coerced and clamped per
 * the schema - which is why the values can be plain strings, and why a
 * hand-mangled number is corrected rather than fatal.
 */
export function buildChain(spec: string): Filter[] {
	return parseChain(spec).map((stage) => {
		const filter = new FILTERS[stage.name]();
		filter.enabled = stage.enabled;

		for (const [key, value] of Object.entries(stage.options)) {
			if (key in filter.schema || key === 'channel') {
				filter.setProperty(key, value);
			}
		}
		return filter;
	});
}

/**
 * Filters back to text.
 *
 * Only properties that differ from their default are written, so the common
 * case stays short and the text stays stable when a default changes underneath
 * it.
 */
export function formatChain(filters: readonly Filter[]): string {
	return filters
		.map((filter) => {
			let part = filter.constructor.name;

			for (const [key, field] of Object.entries(filter.schema)) {
				const value = filter.getProperty(key);
				if (value === field.default) {
					continue;
				}
				part += `${PROPERTY_SEPARATOR}${key}=${value === null ? '' : encodeURIComponent(String(value))}`;
			}
			if (!filter.enabled) {
				part += BYPASSED;
			}
			return part;
		})
		.join(FILTER_SEPARATOR);
}
