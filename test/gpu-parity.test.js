// Comparison B from FEATURES.md #6: the GPU implementation against the live CPU
// one, in the same run.
//
// Deliberately separate from the golden test. The golden pins CPU output to a
// committed PNG; this pins the shader to whatever the CPU currently does. Fold
// them together and a legitimate CPU change makes the GPU test fail for a
// reason that has nothing to do with the GPU.
//
// The CPU path is the oracle, not a second opinion. A disagreement is a bug in
// the shader until shown otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cases, caseName } from './helpers/cases.js';
import { openHarness } from './helpers/gpu-harness.js';

const harness = await openHarness();

if (!harness) {
	test('GPU parity', { skip: 'no browser available to drive WebGL2' }, () => {});
} else if (!harness.available) {
	await harness.close();
	test('GPU parity', { skip: 'browser has no WebGL2' }, () => {});
} else {
	test('the harness page loaded without errors', () => {
		assert.deepEqual(harness.errors, []);
	});

	const report = [];

	for (const entry of cases) {
		const name = caseName(entry);
		const metric = entry.gpu ?? { mode: 'tolerance', tolerance: 3 };

		test(`gpu: ${name}`, async () => {
			const result = await harness.run(entry);
			report.push({ name, gpu: result.ranOnGPU, reason: result.reason });

			if (!result.ranOnGPU) {
				//Not a failure. Some filters have no shader yet and some have one
				//covering only part of their options - both are recorded rather than
				//hidden, so what is still CPU-only shows up in the test output
				//instead of living in a comment.
				assert.ok(result.reason, `${name} fell back without saying why`);
				return;
			}

			assert.ok(!result.sizeMismatch, `${name}: ${result.sizeMismatch}`);

			const ratio = result.differing / result.total;

			if (metric.mode === 'banded') {
				//For a filter that quantises into bands, the interior of a band
				//agrees to rounding while the edges can flip a whole band. Neither
				//of the other two metrics describes that: a tolerance fails on the
				//edge pixels, a population budget fails on the interior ones.
				const flipped = result.exceeding[metric.tolerance] / result.total;
				assert.ok(
					flipped <= metric.maxFlippedRatio,
					`${name}: ${(flipped * 100).toFixed(2)}% of pixels differ by more than ` +
						`${metric.tolerance}, budget ${(metric.maxFlippedRatio * 100).toFixed(2)}%; ` +
						`largest channel delta ${result.maxDelta}`
				);
			} else if (metric.mode === 'population') {
				assert.ok(
					ratio <= metric.maxDifferentRatio,
					`${name}: ${(ratio * 100).toFixed(2)}% of pixels differ, budget ` +
						`${(metric.maxDifferentRatio * 100).toFixed(2)}%; largest channel delta ${result.maxDelta}`
				);
			} else {
				assert.ok(
					result.maxDelta <= metric.tolerance,
					`${name}: largest channel delta ${result.maxDelta}, tolerance ${metric.tolerance}` +
						` (${result.differing}/${result.total} pixels differ at all)`
				);
			}
		});
	}

	test('retained frames on the GPU are dropped when the history is invalidated', async () => {
		const { differing, movedBy, total } = await harness.historyResets();

		assert.equal(differing, 0, `${differing} of ${total} bytes differ from a filter that had never run`);
		// guards the test itself: if carrying the stale reference happened to
		// produce the same frame, the assertion above would pass for free
		assert.ok(movedBy > 0, 'the stale reference would have produced the same frame anyway');
	});

	test('summary', (t) => {
		const cpuOnly = report.filter((row) => !row.gpu);
		t.diagnostic(`${report.length - cpuOnly.length}/${report.length} cases ran as shaders`);
		for (const row of cpuOnly) {
			t.diagnostic(`  CPU only: ${row.name} - ${row.reason}`);
		}
		return harness.close();
	});
}
