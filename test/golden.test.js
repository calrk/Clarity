// Golden-image regression: every filter's output is pinned to a committed PNG.
//
// This is comparison A from FEATURES.md #6 - CPU against a stored reference.
// The CPU path is deterministic, so the match is exact; any difference at all
// is a regression. Comparison B (GPU against live CPU output, with tolerance)
// lives in gpu-parity.test.js.
//
// Regenerate the references with `npm run test:golden -- --update`, then review
// the diff before committing. Never update goldens to make a test pass without
// looking at what changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { CLARITY, filterNames } from './helpers/exports.js';
import { cases, caseName } from './helpers/cases.js';
import { runCase, GOLDEN, OUTPUT } from './helpers/run.js';
import { readPNG, writePNG, exists, compare, describeResult } from './helpers/image.js';

const UPDATE = process.argv.includes('--update') || process.env.UPDATE_GOLDEN === '1';

// CPU output is deterministic, so it must match its golden byte for byte
const EXACT = { mode: 'tolerance', tolerance: 0 };


test('every exported filter has at least one golden case', () => {
	const covered = new Set(cases.map((c) => c.filter));
	const missing = filterNames().filter((n) => !covered.has(n));

	assert.deepEqual(missing, [], `filters with no golden case: ${missing.join(', ')}`);
});

test('every case names a filter that exists', () => {
	const unknown = cases
		.map((c) => c.filter)
		.filter((n) => typeof CLARITY[n] !== 'function');

	assert.deepEqual([...new Set(unknown)], [], 'cases reference unknown filters');
});

for (const entry of cases) {
	const name = caseName(entry);

	test(`golden: ${name}`, () => {
		const actual = runCase(entry);
		const goldenPath = join(GOLDEN, `${name}.png`);

		if (UPDATE || !exists(goldenPath)) {
			writePNG(goldenPath, actual);
			if (!UPDATE) {
				assert.fail(
					`no golden for "${name}" - one was written to ${goldenPath}. ` +
						`Review it, then commit it.`
				);
			}
			return;
		}

		const expected = readPNG(goldenPath);
		const result = compare(actual, expected, EXACT);

		if (!result.pass) {
			// write the actual output and a visual diff so the failure is
			// inspectable rather than just a number
			writePNG(join(OUTPUT, `${name}.actual.png`), actual);
			if (result.diff) {
				writePNG(join(OUTPUT, `${name}.diff.png`), result.diff);
			}
			assert.fail(
				`${name} does not match its golden: ${describeResult(result, EXACT)}\n` +
					`  actual: test/output/${name}.actual.png\n` +
					`  diff:   test/output/${name}.diff.png\n` +
					`  If this change is intended, rerun with --update and review the diff.`
			);
		}
	});
}

test('golden output is reproducible across runs', () => {
	// catches a filter that is still reading Math.random or the wall clock:
	// running the same case twice must give identical bytes
	for (const entry of cases) {
		const first = runCase(entry);
		const second = runCase(entry);
		const result = compare(first, second, EXACT);
		assert.ok(
			result.pass,
			`${caseName(entry)} is not reproducible: ${describeResult(result, EXACT)}`
		);
	}
});
