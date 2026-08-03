// Renders every filter's controls through the playground's renderer, against a
// minimal DOM stub.
//
// The renderer lives in site/, not in the library - but the claim it makes is a
// claim about the *library*: that each schema carries enough to build a working
// control without the app knowing anything about the filter. That is worth
// asserting, and a filter whose schema is missing something shows up here
// rather than as an empty box in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as CLARITY from '../dist/clarity.js';
import { filterNames as detectFilters } from './helpers/exports.js';

class StubElement {
	constructor(tag) {
		this.tag = tag;
		this.children = [];
		this.listeners = {};
		this.textContent = '';
		this.classList = {
			names: new Set(),
			add: (name) => this.classList.names.add(name),
			contains: (name) => this.classList.names.has(name)
		};
	}
	appendChild(child) {
		this.children.push(child);
		return child;
	}
	append(...nodes) {
		for (const node of nodes) {
			this.children.push(
				typeof node === 'string'
					? Object.assign(new StubElement('#text'), { textContent: node })
					: node
			);
		}
	}
	addEventListener(type, handler) {
		(this.listeners[type] ??= []).push(handler);
	}
	fire(type) {
		for (const handler of this.listeners[type] ?? []) handler({ target: this });
	}
	all() {
		return [this, ...this.children.flatMap((c) => c.all())];
	}
	find(predicate) {
		return this.all().filter(predicate);
	}
}

// the module reaches for a global `document`, exactly as it does in a browser
globalThis.document = { createElement: (tag) => new StubElement(tag) };

const { createControls } = await import('../site/src/controls.js');
const filterNames = detectFilters();

/** Ignores the change callback; most tests only care about what was built. */
const build = (filter) => createControls(filter, () => {});

test('every filter renders a control per schema field', () => {
	for (const name of filterNames) {
		const filter = new CLARITY[name]({});
		const body = build(filter);

		const fields = Object.entries(CLARITY[name].schema);
		const inputs = body.find((el) => el.tag === 'input' || el.tag === 'select');

		// at least one input per field - a nullable numeric field renders two,
		// the slider and its auto toggle
		assert.ok(
			inputs.length >= fields.length,
			`${name}: ${fields.length} fields but only ${inputs.length} controls`
		);

		for (const [, field] of fields) {
			assert.ok(
				body.find((el) => el.textContent === field.label).length > 0,
				`${name}: no label rendered for "${field.label}"`
			);
		}
	}
});

test('a filter with no options still renders', () => {
	// found rather than named, so this does not break the next time a filter
	// gains its first property - which is exactly how it broke before
	const optionless = filterNames.filter((name) => Object.keys(CLARITY[name].schema).length === 0);
	assert.ok(optionless.length > 0, 'no optionless filter left to check');

	for (const name of optionless) {
		const body = build(new CLARITY[name]({}));
		assert.equal(
			body.find((el) => el.textContent === 'No options.').length,
			1,
			`${name} should render a placeholder rather than an empty box`
		);
	}
});

test('a description becomes a tooltip, so the schema documents itself', () => {
	// several fields carry a `description` that exists purely to be surfaced.
	// If nothing reads it, writing it was busywork.
	const body = build(new CLARITY.Rotator({}));
	const titled = body.find((el) => typeof el.title === 'string' && el.title.length > 0);
	assert.ok(titled.length > 0, 'no field description reached the DOM');
});

test('moving a slider writes a coerced number back to the filter', () => {
	const filter = new CLARITY.Blur({});
	const body = build(filter);
	const slider = body.find((el) => el.tag === 'input' && el.type === 'range')[0];

	assert.equal(Number(slider.min), CLARITY.Blur.schema.radius.min);
	assert.equal(Number(slider.max), CLARITY.Blur.schema.radius.max);

	// a real range input hands back a string
	slider.value = '42';
	slider.fire('input');
	assert.equal(filter.properties.radius, 42);
	assert.equal(typeof filter.properties.radius, 'number');
});

test('a change callback fires, so the page knows to re-render', () => {
	let changes = 0;
	const filter = new CLARITY.Blur({});
	const body = createControls(filter, () => changes++);

	const slider = body.find((el) => el.tag === 'input' && el.type === 'range')[0];
	slider.value = '30';
	slider.fire('input');
	assert.equal(changes, 1);
});

test('a select renders its options and writes the chosen value', () => {
	const filter = new CLARITY.Posteriser({});
	const body = build(filter);
	const select = body.find((el) => el.tag === 'select')[0];

	assert.deepEqual(
		select.children.map((o) => o.value),
		['median', 'fast']
	);

	select.value = 'fast';
	select.fire('change');
	assert.equal(filter.properties.method, 'fast');
});

test('a checkbox writes a boolean', () => {
	const filter = new CLARITY.Invert({});
	const body = build(filter);
	const check = body.find((el) => el.tag === 'input' && el.type === 'checkbox')[0];

	assert.equal(check.checked, false);
	check.checked = true;
	check.fire('change');
	assert.equal(filter.properties.dynamic, true);
});

test('a nullable field gets a way back to null', () => {
	const filter = new CLARITY.ValueThreshold({ threshold: 100 });
	const body = build(filter);

	// checkboxes: `inverted`, then the auto toggle for `threshold`
	const auto = body.find((el) => el.tag === 'input' && el.type === 'checkbox').at(-1);
	auto.checked = true;
	auto.fire('change');
	assert.equal(filter.properties.threshold, null, 'auto means derive it from the frame');

	auto.checked = false;
	auto.fire('change');
	assert.equal(typeof filter.properties.threshold, 'number');
});
