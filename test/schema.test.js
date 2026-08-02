// The schemas are only useful if they describe the filters accurately, and a
// hand-written description of hand-written code drifts the moment nobody is
// looking. These tests are what stop that: they compare every schema against
// the filter it claims to describe, rather than against another document.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as CLARITY from '../dist/clarity.js';
import { filterNames as detectFilters } from './helpers/exports.js';

class NodeImageData {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = new Uint8ClampedArray(width * height * 4);
	}
}
CLARITY.setImageDataFactory((w, h) => new NodeImageData(w, h));

const filterNames = detectFilters();

/** A small frame with structure, so filters have something to chew on. */
function makeFrame() {
	const f = new NodeImageData(16, 12);
	for (let y = 0; y < 12; y++) {
		for (let x = 0; x < 16; x++) {
			const i = (y * 16 + x) * 4;
			f.data.set([x * 16, y * 20, x < 8 ? 30 : 210, 255], i);
		}
	}
	return f;
}

const DUAL_INPUT = new Set(['Add', 'Subtract', 'Blend', 'Mask', 'Multiply']);

const run = (filter) =>
	filter.process(DUAL_INPUT.has(filter.constructor.name) ? [makeFrame(), makeFrame()] : makeFrame());

for (const name of filterNames) {
	const Ctor = CLARITY[name];
	const schema = Ctor.schema;

	test(`${name} declares a schema for exactly its properties`, () => {
		assert.ok(schema && typeof schema === 'object', 'has a schema object');

		const instance = new Ctor({});
		const declared = new Set(Object.keys(schema));
		const actual = new Set(Object.keys(instance.properties));

		for (const key of actual) {
			assert.ok(declared.has(key), `${name}.properties.${key} is not in the schema`);
		}
		for (const key of declared) {
			// `channel` is the one field held on the filter rather than in
			// `properties`, because it is declared on the base class
			assert.ok(
				actual.has(key) || key === 'channel',
				`schema declares ${key}, which ${name} does not have`
			);
		}
	});

	test(`${name} schema defaults match what the constructor builds`, () => {
		// the anti-drift assertion. A schema default that disagrees with the
		// constructor means a UI opens showing a value the filter isn't using.
		const instance = new Ctor({});
		for (const [key, field] of Object.entries(schema)) {
			assert.deepEqual(
				instance.getProperty(key),
				field.default,
				`${name}.${key}: constructed ${JSON.stringify(instance.getProperty(key))}, schema says ${JSON.stringify(field.default)}`
			);
		}
	});

	test(`${name} schema fields are internally consistent`, () => {
		for (const [key, field] of Object.entries(schema)) {
			const where = `${name}.${key}`;

			if (field.type === 'int' || field.type === 'float') {
				assert.ok(field.min < field.max, `${where}: min must be below max`);
				assert.ok(field.step > 0, `${where}: step must be positive`);
				if (field.default === null) {
					assert.ok(field.nullable, `${where}: null default needs nullable`);
				} else {
					assert.ok(
						field.default >= field.min && field.default <= field.max,
						`${where}: default ${field.default} is outside ${field.min}..${field.max}`
					);
				}
				if (field.type === 'int') {
					assert.ok(
						field.default === null || Number.isInteger(field.default),
						`${where}: int default is not an integer`
					);
				}
			} else if (field.type === 'bool') {
				assert.equal(typeof field.default, 'boolean', `${where}: default must be boolean`);
			} else if (field.type === 'select') {
				assert.ok(field.options.length > 0, `${where}: needs options`);
				assert.ok(
					field.options.some((o) => o.value === field.default),
					`${where}: default is not one of the options`
				);
			} else {
				assert.fail(`${where}: unknown field type ${field.type}`);
			}

			assert.ok(field.label, `${where}: needs a label`);
		}
	});

	test(`${name} survives the extremes of its declared ranges`, () => {
		// The point of declaring a range is that everything inside it is legal.
		// This is the cheap version of the property-based fuzzing in FEATURES #6.
		for (const [key, field] of Object.entries(schema)) {
			const values =
				field.type === 'bool'
					? [true, false]
					: field.type === 'select'
						? field.options.map((o) => o.value)
						: field.nullable
							? [field.min, field.max, null]
							: [field.min, field.max];

			for (const value of values) {
				const filter = new Ctor({});
				filter.setProperty(key, value);
				const out = run(filter);

				// A filter may change the frame's size, but only the size it said it
				// would - the GPU executor allocates its target from outputSize()
				// before the shader runs, so a disagreement there is a corrupt frame
				const expected = Ctor.outputSize(filter, 16, 12);
				assert.equal(out.width, expected.width, `${name}.${key}=${value} width does not match outputSize`);
				assert.equal(out.height, expected.height, `${name}.${key}=${value} height does not match outputSize`);
				assert.equal(
					out.data.length,
					expected.width * expected.height * 4,
					`${name}.${key}=${value} frame size does not match its dimensions`
				);
				for (let i = 0; i < out.data.length; i++) {
					assert.ok(!Number.isNaN(out.data[i]), `${name}.${key}=${value} produced NaN at byte ${i}`);
				}
			}
		}
	});
}

test('every filter with options declares them', () => {
	// A filter that takes options but declares none would silently get no UI.
	const undeclared = filterNames.filter(
		(name) => Object.keys(new CLARITY[name]({}).properties).length > 0 && Object.keys(CLARITY[name].schema).length === 0
	);
	assert.deepEqual(undeclared, []);
});

test('setProperty coerces the strings a DOM input hands back', () => {
	const blur = new CLARITY.Blur({});
	blur.setProperty('radius', '24');
	assert.equal(blur.properties.radius, 24);
	assert.equal(typeof blur.properties.radius, 'number');

	// an int field rounds rather than truncating towards zero
	blur.setProperty('radius', '24.7');
	assert.equal(blur.properties.radius, 25);

	// "false" from a URL fragment is falsey, not a non-empty truthy string
	const invert = new CLARITY.Invert({});
	invert.setProperty('dynamic', 'false');
	assert.equal(invert.properties.dynamic, false);
	invert.setProperty('dynamic', 'true');
	assert.equal(invert.properties.dynamic, true);
});

test('setProperty clamps to the declared range', () => {
	const blur = new CLARITY.Blur({});
	blur.setProperty('radius', 9999);
	assert.equal(blur.properties.radius, CLARITY.Blur.schema.radius.max);
	blur.setProperty('radius', -50);
	assert.equal(blur.properties.radius, CLARITY.Blur.schema.radius.min);
});

test('setProperty rejects an unknown key', () => {
	assert.throws(() => new CLARITY.Blur({}).setProperty('radius ', 4), /no property/);
	assert.throws(() => new CLARITY.Blur({}).setProperty('nonsense', 4), /no property/);
});

test('a nullable field accepts null and empty string', () => {
	const threshold = new CLARITY.ValueThreshold({ threshold: 100 });
	assert.equal(threshold.properties.threshold, 100);

	threshold.setProperty('threshold', null);
	assert.equal(threshold.properties.threshold, null);

	threshold.setProperty('threshold', 90);
	threshold.setProperty('threshold', '');
	assert.equal(threshold.properties.threshold, null, 'a cleared input means auto');
});

test('channel is routed to the filter rather than into properties', () => {
	const threshold = new CLARITY.ValueThreshold({});
	threshold.setProperty('channel', 'red');

	assert.equal(threshold.channel, 'red');
	assert.equal(threshold.getProperty('channel'), 'red');
	assert.ok(!('channel' in threshold.properties), 'channel does not leak into properties');

	// an unrecognised channel falls back to the default rather than breaking reads
	threshold.setProperty('channel', 'magenta');
	assert.equal(threshold.channel, 'grey');
});

test('toggleProperty flips a boolean', () => {
	const mirror = new CLARITY.Mirror({});
	assert.equal(mirror.properties.Vertical, false);
	mirror.toggleProperty('Vertical');
	assert.equal(mirror.properties.Vertical, true);
	mirror.toggleProperty('Vertical');
	assert.equal(mirror.properties.Vertical, false);
});

test('constructing from defaultsOf reproduces a default filter', () => {
	// what a host app does when it spawns a filter from its schema
	for (const name of filterNames) {
		const Ctor = CLARITY[name];
		const fromDefaults = new Ctor(CLARITY.defaultsOf(Ctor.schema));
		const plain = new Ctor({});
		assert.deepEqual(fromDefaults.properties, plain.properties, name);
	}
});

test('derived state is rebuilt when the property it came from changes', () => {
	// these rebuilds used to live inside doCreateControls, so they only ran when
	// the change arrived from a slider
	const sharpen = new CLARITY.Sharpen({ intensity: 1 });
	const before = JSON.stringify(sharpen.kernel);
	sharpen.setProperty('intensity', 2.5);
	assert.notEqual(JSON.stringify(sharpen.kernel), before, 'Sharpen rebuilt its kernel');

	const motion = new CLARITY.MotionDetector({ frameCount: 1 });
	motion.process(makeFrame());
	motion.process(makeFrame());
	motion.setProperty('frameCount', 6);
	assert.deepEqual(motion.frames, [], 'MotionDetector dropped its stale ring');
	assert.equal(motion.preindex, 6);

	const puzzler = new CLARITY.Puzzler({ horizontalSegs: 4, verticalSegs: 4 });
	puzzler.setProperty('verticalSegs', 6);
	assert.equal(puzzler.swaps.length, 6, 'Puzzler rebuilt its grid');
	assert.equal(puzzler.swaps[5].length, 4);
});

test('setProperty marks the filter dirty', () => {
	const blur = new CLARITY.Blur({});
	blur.dirty = false;
	blur.setProperty('radius', 3);
	assert.equal(blur.dirty, true);
});

test('the DOM control builders are gone', () => {
	assert.equal(CLARITY.Interface, undefined);
	assert.equal(typeof new CLARITY.Blur({}).doCreateControls, 'undefined');
	assert.equal(typeof new CLARITY.Blur({}).createControls, 'undefined');
});
