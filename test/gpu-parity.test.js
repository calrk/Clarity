// CPU/GPU parity: comparison B from FEATURES.md #6.
//
// Every filter is implemented twice - see the decision recorded in #3, where
// the CPU path is kept permanently as a first-class fallback rather than
// deleted after the port. This file is the mechanism that stops the two
// implementations drifting apart: a GPU filter is "done" when it agrees with
// the CPU reference, and it stays done because this runs on every commit.
//
// Deliberately NOT compared against the committed goldens. Those pin CPU
// behaviour; diffing the GPU against them would mean a legitimate CPU change
// breaks the GPU tests for an unrelated reason. Here the CPU output is
// computed fresh in the same run and used as the oracle.
//
// Tolerance is per-case, not global - see the note at the top of
// helpers/cases.js for why thresholders need a different metric entirely.
//
// Skipped until #3 lands a GPU backend. When it does, the only change needed
// here is to make `gpuBackendAvailable()` detect it and `runOnGPU()` drive it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { cases, caseName } from './helpers/cases.js';
import { runCase, OUTPUT } from './helpers/run.js';
import { writePNG, compare, describeResult } from './helpers/image.js';

/**
 * Whether a GPU backend can run in this environment.
 *
 * Headless CI has no real GPU, so when the backend arrives this needs either
 * SwiftShader via headless Chrome, or an explicit opt-in so the suite stays
 * green on machines that can't run it. Returning false skips rather than fails.
 */
function gpuBackendAvailable() {
	return false; // #3 has not landed a GPU backend yet
}

/**
 * Runs a case through the GPU backend.
 *
 * @param {object} _entry a case from helpers/cases.js
 * @returns {ImageData}
 */
function runOnGPU(_entry) {
	throw new Error('no GPU backend yet - see FEATURES.md #3');
}

const available = gpuBackendAvailable();

test('GPU parity harness is wired up', () => {
	// guards the plumbing even while the backend is missing: the cases list,
	// the CPU runner and the comparison helpers all have to keep working, or
	// #3 inherits a broken harness
	assert.ok(cases.length > 0, 'there are cases to compare');

	const sample = cases[0];
	const cpu = runCase(sample);
	assert.ok(cpu?.data?.length > 0, 'the CPU oracle produces output');

	// a filter compared against itself must pass under its own tolerance -
	// if this fails, the comparison logic is broken, not the shader
	const result = compare(cpu, runCase(sample), sample.gpu);
	assert.ok(result.pass, describeResult(result, sample.gpu));
});

test('every case declares how it should be compared', () => {
	const missing = cases.filter((c) => !c.gpu?.mode).map(caseName);
	assert.deepEqual(missing, [], `cases with no gpu comparison mode: ${missing.join(', ')}`);

	const bad = cases
		.filter((c) => !['tolerance', 'population'].includes(c.gpu.mode))
		.map(caseName);
	assert.deepEqual(bad, [], 'cases with an unknown comparison mode');
});

for (const entry of cases) {
	const name = caseName(entry);

	test(`gpu parity: ${name}`, { skip: available ? false : 'no GPU backend (FEATURES.md #3)' }, () => {
		const cpu = runCase(entry);
		const gpu = runOnGPU(entry);

		const result = compare(gpu, cpu, entry.gpu);

		if (!result.pass) {
			writePNG(join(OUTPUT, `${name}.cpu.png`), cpu);
			writePNG(join(OUTPUT, `${name}.gpu.png`), gpu);
			if (result.diff) {
				writePNG(join(OUTPUT, `${name}.parity-diff.png`), result.diff);
			}
			assert.fail(
				`${name}: GPU output disagrees with the CPU reference: ` +
					`${describeResult(result, entry.gpu)}\n` +
					`  cpu:  test/output/${name}.cpu.png\n` +
					`  gpu:  test/output/${name}.gpu.png\n` +
					`  diff: test/output/${name}.parity-diff.png`
			);
		}
	});
}
