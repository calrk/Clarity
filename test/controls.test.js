// Renders every filter's controls through the example renderer, against a
// minimal DOM stub.
//
// The renderer lives in examples/, not in the library - but the claim it makes
// is a claim about the *library*: that each schema carries enough to build a
// working control without the app knowing anything about the filter. That is
// worth asserting, and a filter whose schema is missing something shows up here
// rather than as an empty box in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as CLARITY from '../dist/clarity.js';
import { filterNames as detectFilters } from './helpers/exports.js';

const here = dirname(fileURLToPath(import.meta.url));

class StubElement {
	constructor(tag) {
		this.tag = tag;
		this.children = [];
		this.listeners = {};
		this.textContent = '';
	}
	appendChild(child) {
		this.children.push(child);
		return child;
	}
	addEventListener(type, fn) {
		(this.listeners[type] ??= []).push(fn);
	}
	fire(type) {
		for (const fn of this.listeners[type] ?? []) fn();
	}
	/** Every element in the subtree, this one included. */
	all() {
		return [this, ...this.children.flatMap((c) => c.all())];
	}
	find(predicate) {
		return this.all().filter(predicate);
	}
}

// load the renderer with a stub document in scope, the way a browser would
const source = readFileSync(join(here, '..', 'examples', 'js', 'controls.js'), 'utf8');
const scope = {
	document: { createElement: (tag) => new StubElement(tag) },
	window: {}
};
new Function('document', 'window', source)(scope.document, scope.window);
const { createControls } = scope.window.ClarityControls;

const filterNames = detectFilters();

test('every filter renders a control per schema field', () => {
	for (const name of filterNames) {
		const filter = new CLARITY[name]({});
		const group = createControls(filter, name);

		const fields = Object.entries(CLARITY[name].schema);
		const inputs = group.find((el) => el.tag === 'input' || el.tag === 'select');

		// one enabled checkbox, plus at least one input per field (a nullable
		// numeric field renders two: the slider and its auto toggle)
		assert.ok(
			inputs.length >= fields.length + 1,
			`${name}: ${fields.length} fields but only ${inputs.length - 1} controls`
		);

		for (const [, field] of fields) {
			assert.ok(
				group.find((el) => el.textContent === field.label).length > 0,
				`${name}: no label rendered for "${field.label}"`
			);
		}
	}
});

test('a filter with no options still renders', () => {
	const group = createControls(new CLARITY.Desaturate({}), 'Desaturate');
	assert.ok(group.find((el) => el.textContent === 'No options.').length === 1);
});

test('the enabled checkbox is wired to the filter', () => {
	const filter = new CLARITY.Blur({});
	const group = createControls(filter, 'Blur');
	const check = group.find((el) => el.tag === 'input' && el.type === 'checkbox')[0];

	assert.equal(check.checked, true);
	check.checked = false;
	check.fire('change');
	assert.equal(filter.enabled, false);
});

test('moving a slider writes a coerced number back to the filter', () => {
	const filter = new CLARITY.Blur({});
	const group = createControls(filter, 'Blur');
	const slider = group.find((el) => el.tag === 'input' && el.type === 'range')[0];

	assert.equal(Number(slider.min), CLARITY.Blur.schema.radius.min);
	assert.equal(Number(slider.max), CLARITY.Blur.schema.radius.max);

	// a real range input hands back a string
	slider.value = '42';
	slider.fire('input');
	assert.equal(filter.properties.radius, 42);
	assert.equal(typeof filter.properties.radius, 'number');
});

test('a select renders its options and writes the chosen value', () => {
	const filter = new CLARITY.Posteriser({});
	const group = createControls(filter, 'Posteriser');
	const select = group.find((el) => el.tag === 'select')[0];

	assert.deepEqual(
		select.children.map((o) => o.value),
		['median', 'fast']
	);

	select.value = 'fast';
	select.fire('change');
	assert.equal(filter.properties.method, 'fast');
});

test('a nullable field gets a way back to null', () => {
	const filter = new CLARITY.ValueThreshold({ threshold: 100 });
	const group = createControls(filter, 'ValueThreshold');

	// checkboxes: enabled, inverted, then the auto toggle for threshold
	const auto = group.find((el) => el.tag === 'input' && el.type === 'checkbox').at(-1);
	auto.checked = true;
	auto.fire('change');
	assert.equal(filter.properties.threshold, null, 'auto means derive it from the frame');

	auto.checked = false;
	auto.fire('change');
	assert.equal(typeof filter.properties.threshold, 'number');
});
