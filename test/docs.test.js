// The generated filter reference, checked against the code it describes.
//
// `docs/FILTERS.md` is committed rather than built on demand, so that a change
// to a filter shows up as a docs diff in the same commit - you review the
// wording beside the code, and drift becomes something you have to actively
// approve rather than something that happens quietly. That only works if a
// stale file fails the build, which is what this is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildDocs, DOCS_PATH } from './helpers/make-docs.js';
//Importable directly, unlike sources.js, because it is data and imports nothing
import { PRESETS } from '../site/src/presets.js';
import * as CLARITY from '../dist/clarity.js';

const SOURCES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'src', 'sources.js');

test('docs/FILTERS.md is up to date', () => {
	assert.ok(existsSync(DOCS_PATH), 'run `npm run docs`');
	assert.equal(
		readFileSync(DOCS_PATH, 'utf8'),
		buildDocs(),
		'docs/FILTERS.md is stale - run `npm run docs` and commit the result'
	);
});

test('every filter reached the page, with its options', () => {
	const page = readFileSync(DOCS_PATH, 'utf8');
	for (const name of Object.keys(CLARITY.CATALOGUE)) {
		assert.ok(page.includes(`### ${name}\n`), `${name} has no section`);
		for (const key of Object.keys(CLARITY.FILTERS[name].schema ?? {})) {
			assert.ok(page.includes(`| \`${key}\` |`), `${name}.${key} is not documented`);
		}
	}
});

/**
 * The playground sources that actually exist.
 *
 * Read out of the real SOURCES list rather than copied: a link naming a source
 * the playground does not have loads the wrong picture instead of failing, so
 * nothing else would catch it. `sources.js` cannot be imported - it imports
 * .jpg and .mp4, which only Vite resolves - so this scrapes it, which still
 * beats the hand-copied set that used to sit here and went stale the moment a
 * sample was added.
 */
function playgroundSources() {
	const sources = new Set(
		[...readFileSync(SOURCES_PATH, 'utf8').matchAll(/^\s*\{ id: '([^']+)'/gm)].map((m) => m[1])
	);
	assert.ok(sources.size >= 7, `only found ${sources.size} sources - has sources.js been reformatted?`);
	return sources;
}

/**
 * A link that 404s is obvious; one that silently drops a property is not.
 * Round-tripping through the library catches a renamed filter, a renamed
 * property, and a value the schema would clamp away.
 */
function checkLinks(links, sources, where) {
	for (const link of links) {
		const parts = link.split('/');
		const source = parts.shift();
		assert.ok(sources.has(source), `${where} ${link}: no such playground source "${source}"`);

		const chain = CLARITY.buildChain(parts.join('/'));
		assert.equal(chain.length, parts.length, `${where} ${link}: a filter was skipped`);
		assert.equal(
			CLARITY.formatChain(chain),
			parts.join('/'),
			`${where} ${link}: does not round-trip, so something was dropped or clamped`
		);
	}
}

const linksIn = (text) =>
	[...text.matchAll(/https:\/\/clarity\.clarklavery\.com\/#([^)\s]+)/g)].map((match) => match[1]);

test('every playground link parses back to the chain it claims', () => {
	const page = readFileSync(DOCS_PATH, 'utf8');
	const links = linksIn(page);

	assert.equal(links.length, Object.keys(CLARITY.CATALOGUE).length, 'one link per filter');
	checkLinks(links, playgroundSources(), 'FILTERS.md');
});

test('every preset still builds the chain it claims', () => {
	// A preset that has rotted loads a shorter chain than its label promises and
	// says nothing about it, which is the worst failure mode on the page: the
	// user has no chain of their own to compare it against.
	assert.ok(PRESETS.length >= 4, `only found ${PRESETS.length} presets`);
	checkLinks(
		PRESETS.map((preset) => preset.chain),
		playgroundSources(),
		'preset'
	);

	const ids = PRESETS.map((preset) => preset.id);
	assert.equal(new Set(ids).size, ids.length, 'two presets share an id');

	for (const preset of PRESETS) {
		assert.ok(preset.label, `${preset.id} has no label`);
		assert.ok(preset.note, `${preset.id} has no note - it is the button's tooltip`);
		//a one-filter preset is a filter, not a preset; the point is combinations
		assert.ok(
			preset.chain.split('/').length >= 2,
			`${preset.id} is a bare source with no filters`
		);
	}
});

test("the README's example chains still work", () => {
	// These are hand-written, unlike the generated ones above, so they are the
	// links most likely to rot - and they are the first thing anyone clicks.
	const links = linksIn(readFileSync('README.md', 'utf8'));
	assert.ok(links.length >= 5, `only found ${links.length} example links in the README`);
	checkLinks(links, playgroundSources(), 'README');
});

test("the README's filter table has not fallen behind", () => {
	// The table is a hand-committed summary of CATALOGUE, so it is exactly the
	// kind of second copy that goes stale. The full reference is generated; this
	// only has to stay complete.
	const readme = readFileSync('README.md', 'utf8');
	const names = Object.keys(CLARITY.CATALOGUE);
	const missing = names.filter((name) => !readme.includes(`\`${name}\``));
	assert.deepEqual(missing, [], 'filters missing from the README table - update it');

	// The sentence above the table counts them, and a count is worse than the
	// list it summarises: a missing filter is visible, a stale number is not.
	// This one had drifted three behind before anything noticed.
	const counted = /^(\d+) of them, in (\w+) families/m.exec(readme);
	assert.ok(counted, 'the README no longer says how many filters there are');
	assert.equal(Number(counted[1]), names.length, 'the README\'s filter count is stale');

	const families = new Set(names.map((name) => CLARITY.CATALOGUE[name].category));
	const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
	assert.equal(counted[2], words[families.size], 'the README\'s family count is stale');
});
