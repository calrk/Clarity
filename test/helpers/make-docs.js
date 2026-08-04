// The filter reference, written from the library's own metadata.
//
// Run with `npm run docs`. Nothing here is hand-written prose: the summaries
// come from CATALOGUE, the options from each filter's schema, the pictures
// from the committed golden images, and the example invocation from the golden
// case that produced the picture beside it. That last part is the point - a
// hand-typed `new Blur({ radius: 6 })` in a document is a claim, while one
// taken from a case is checked by the test suite on every run.
//
// `npm test` regenerates this and compares, so the committed file cannot drift
// from the code it describes.
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CATALOGUE, CATEGORY_ORDER, TRAITS, FILTERS, formatChain } from '../../dist/clarity.js';
import { cases, caseName } from './cases.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
export const DOCS_PATH = join(root, 'docs', 'FILTERS.md');

const PLAYGROUND = 'https://clarity.clarklavery.com/';

/** Width the golden images are shown at. They are 64x48, so this is a 3x zoom. */
const THUMB = 192;

/**
 * The handful of filters whose best demonstration no trait can predict.
 *
 * The traits say what a filter *requires*, which is a different question from
 * what shows it off. Nothing marks Morphology as wanting a near-binary shape
 * with speckle on it, or Pixelate as wanting something whose detail you would
 * miss. Kept short and explicit on purpose: the rule below is what scales, and
 * this is the exception list it cannot cover. See FEATURES.md #11.
 */
const DEMO_SOURCE = {
	Morphology: 'rorschach',
	Convolver: 'books',
	EdgeDetector: 'books',
	GradientThreshold: 'books',
	Pixelate: 'books',
	Posteriser: 'books',
	SkinDetector: 'face'
};

/**
 * Which playground source shows a filter off, derived from its traits.
 *
 * A curated demo per filter would be better - the golden cases run against
 * 64x48 fixtures that the playground does not have, so these cannot simply be
 * reused - but the traits already say what kind of input a filter needs, and a
 * rule that follows from them cannot fall out of date the way a second list
 * would.
 */
function playgroundSource(name, traits) {
	if (DEMO_SOURCE[name]) return DEMO_SOURCE[name];
	if (traits.includes('starter')) return 'blank';
	if (traits.includes('heightmap-in') || traits.includes('normalmap-in')) return 'heightmap';
	//A temporal filter has nothing to compare on a still. This used to be
	//`camera`, so every one of these links opened with a permission prompt -
	//a poor first thing to ask of someone reading the documentation.
	if (traits.includes('temporal')) return 'crystal';
	//The fallback carries most of the catalogue, so it has to be a picture with
	//both colour and fine detail. It used to be `colours`, a smooth rainbow ramp
	//- which meant every filter that works on detail demonstrated itself on an
	//image that has none.
	return 'landscape';
}

/** The golden case that best represents a filter: its plainest one. */
function primaryCase(name) {
	return cases.find((entry) => entry.filter === name && !entry.name)
		?? cases.find((entry) => entry.filter === name);
}

/**
 * The chain string for a case, built by constructing the filter and formatting
 * it - so it is exactly what the library would parse back, and only properties
 * differing from their defaults appear.
 */
function chainFor(name, entry) {
	const filter = new FILTERS[name](entry?.options ?? {});
	const pre = (entry?.pre ?? []).map((step) => new FILTERS[step.filter](step.options ?? {}));
	return formatChain([...pre, filter]);
}

const escape = (text) => String(text).replace(/\|/g, '\\|');

/** An options bag as it would be typed, rather than as JSON.stringify spells it. */
function jsOptions(options) {
	const entries = Object.entries(options ?? {});
	if (!entries.length) return '';
	return `{ ${entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ')} }`;
}

function rangeOf(field) {
	if (field.type === 'bool') return 'true / false';
	if (field.type === 'select') return field.options.map((o) => `\`${o.value}\``).join(' · ');
	const range = `${field.min}–${field.max}`;
	return field.nullable ? `${range}, or empty for ${field.nullLabel ?? 'auto'}` : range;
}

function defaultOf(field) {
	if (field.default === null) return `_${field.nullLabel ?? 'auto'}_`;
	return `\`${field.default}\``;
}

function optionsTable(schema) {
	const keys = Object.keys(schema);
	if (!keys.length) return '_No options._\n';

	const rows = keys.map((key) => {
		const field = schema[key];
		return `| \`${key}\` | ${field.type} | ${escape(rangeOf(field))} | ${defaultOf(field)} | ${escape(field.description)} |`;
	});
	return ['| Property | Type | Range | Default | |', '|---|---|---|---|---|', ...rows].join('\n') + '\n';
}

function imagesFor(name, entry) {
	if (!entry) return '';
	const golden = join(root, 'test', 'golden', `${caseName(entry)}.png`);
	if (!existsSync(golden)) return '';

	const before = `../test/fixtures/${entry.input}.png`;
	const after = `../test/golden/${caseName(entry)}.png`;
	const note = entry.pre?.length
		? ` (after ${entry.pre.map((step) => step.filter).join(' → ')})`
		: '';

	return (
		`<img src="${before}" width="${THUMB}" alt="The ${entry.input} fixture${note}"> ` +
		`<img src="${after}" width="${THUMB}" alt="${name} applied to it">\n`
	);
}

export function buildDocs() {
	const names = Object.keys(CATALOGUE);
	const out = [];

	out.push('# Clarity — Filter Reference\n');
	out.push(
		'**Generated by `npm run docs`. Do not edit.** Every summary, option, range and\n' +
			'description here comes from the library itself, and the pictures are the golden\n' +
			'images the test suite asserts against — so this page cannot describe a version\n' +
			'of a filter that does not exist.\n'
	);
	out.push(
		`${names.length} filters. Each links into the [playground](${PLAYGROUND}), where the\n` +
			'chain in the address bar is the same text the library parses.\n'
	);
	out.push(
		'The images are the test fixtures, which are 64×48 so the goldens stay small and\n' +
			'diffable — they show the shape of an effect, not its quality. Follow the\n' +
			'playground link to see one at a sensible size.\n'
	);

	// contents
	out.push('## Contents\n');
	for (const category of CATEGORY_ORDER) {
		const group = names.filter((name) => CATALOGUE[name].category === category);
		if (!group.length) continue;
		const links = group.map((name) => `[${name}](#${name.toLowerCase()})`).join(' · ');
		out.push(`**${category}** — ${links}\n`);
	}

	// the traits legend, so a badge below means something
	out.push('## What the badges mean\n');
	out.push('| Badge | Meaning |');
	out.push('|---|---|');
	for (const [, info] of Object.entries(TRAITS)) {
		out.push(`| **${info.label}** | ${escape(info.description)} |`);
	}
	out.push('');

	for (const category of CATEGORY_ORDER) {
		const group = names.filter((name) => CATALOGUE[name].category === category);
		if (!group.length) continue;

		out.push(`## ${category}\n`);

		for (const name of group) {
			const entry = CATALOGUE[name];
			const traits = entry.traits ?? [];
			const example = primaryCase(name);

			out.push(`### ${name}\n`);
			out.push(`${entry.summary}\n`);

			if (traits.length) {
				out.push(traits.map((trait) => `**${TRAITS[trait].label}**`).join(' · ') + '\n');
			}

			const images = imagesFor(name, example);
			if (images) out.push(images);

			const chain = chainFor(name, example);
			const source = playgroundSource(name, traits);
			out.push(`[Open in the playground →](${PLAYGROUND}#${source}/${chain})\n`);
			out.push('```js');
			out.push(`import { ${name} } from '@calrk/clarity';\n`);
			out.push(`new ${name}(${jsOptions(example?.options)});`);
			out.push('```\n');
			out.push(optionsTable(FILTERS[name].schema ?? {}));
		}
	}

	out.push('---\n');
	out.push('_Regenerate with `npm run docs`._\n');

	return out.join('\n');
}

// running it directly writes the file; the test imports buildDocs and compares
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	writeFileSync(DOCS_PATH, buildDocs());
	console.log(`wrote ${DOCS_PATH}`);
}
