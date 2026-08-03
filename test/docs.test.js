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

import { buildDocs, DOCS_PATH } from './helpers/make-docs.js';
import * as CLARITY from '../dist/clarity.js';

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

test('every playground link parses back to the chain it claims', () => {
	// A link that 404s is obvious; one that silently drops a property is not.
	// Round-tripping through the library catches a renamed filter, a renamed
	// property, and a value the schema would clamp away.
	const sources = new Set(['colours', 'heightmap', 'blank', 'camera']);
	const page = readFileSync(DOCS_PATH, 'utf8');
	const links = [...page.matchAll(/playground →\]\(https:\/\/[^/]+\/#([^)]+)\)/g)].map((m) => m[1]);

	assert.equal(links.length, Object.keys(CLARITY.CATALOGUE).length, 'one link per filter');

	for (const link of links) {
		const parts = link.split('/');
		const source = parts.shift();
		assert.ok(sources.has(source), `${link}: no such playground source "${source}"`);

		const chain = CLARITY.buildChain(parts.join('/'));
		assert.equal(chain.length, parts.length, `${link}: a filter was skipped`);
		assert.equal(
			CLARITY.formatChain(chain),
			parts.join('/'),
			`${link}: does not round-trip, so something was dropped or clamped`
		);
	}
});

test("the README's filter table has not fallen behind", () => {
	// The table is a hand-committed summary of CATALOGUE, so it is exactly the
	// kind of second copy that goes stale. The full reference is generated; this
	// only has to stay complete.
	const readme = readFileSync('README.md', 'utf8');
	const missing = Object.keys(CLARITY.CATALOGUE).filter((name) => !readme.includes(`\`${name}\``));
	assert.deepEqual(missing, [], 'filters missing from the README table - update it');
});
