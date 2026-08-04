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

// Which filters need a second frame, asked rather than listed - the same
// lookup the playground uses. A hardcoded set here is how a new dual-input
// filter gets handed one frame and crashes in a test that looks unrelated.
const isDualInput = (name) => (CLARITY.CATALOGUE[name]?.traits ?? []).includes('dual');

const run = (filter) =>
	filter.process(isDualInput(filter.constructor.name) ? [makeFrame(), makeFrame()] : makeFrame());

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
	assert.equal(mirror.properties.vertical, false);
	mirror.toggleProperty('vertical');
	assert.equal(mirror.properties.vertical, true);
	mirror.toggleProperty('vertical');
	assert.equal(mirror.properties.vertical, false);
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

test('every filter is in the catalogue, and nothing else is', () => {
	// The catalogue is what a palette, a docs page or the contact sheet reads to
	// find out what a filter is. Three separate hand-maintained lists did this
	// job before it existed, and they had already drifted - so the thing worth
	// asserting is that it stays complete as filters come and go.
	const catalogued = Object.keys(CLARITY.CATALOGUE).sort();
	assert.deepEqual(catalogued, [...filterNames].sort());

	for (const [name, entry] of Object.entries(CLARITY.CATALOGUE)) {
		assert.ok(
			CLARITY.CATEGORY_ORDER.includes(entry.category),
			`${name}: category "${entry.category}" is not in CATEGORY_ORDER`
		);
		assert.ok(entry.summary.length > 10, `${name}: needs a real summary`);
		assert.ok(entry.summary.endsWith('.'), `${name}: summary should be a sentence`);
	}
});

test('the registry holds exactly the exported filters', () => {
	// `FILTERS` is what turns a name back into a constructor, for anything
	// rebuilding a chain from text - a URL, a preset, a `clarity=""` attribute.
	// It is a third hand-maintained list of the same 41 things, so it gets the
	// same completeness check as the catalogue.
	assert.deepEqual(Object.keys(CLARITY.FILTERS).sort(), [...filterNames].sort());

	for (const [name, Ctor] of Object.entries(CLARITY.FILTERS)) {
		assert.equal(Ctor, CLARITY[name], `${name} in the registry is not the exported class`);
	}
});

test('a chain survives a round trip through text', () => {
	const before = [
		new CLARITY.Blur({ radius: 8 }),
		new CLARITY.Desaturate({ amount: 0.4 }),
		new CLARITY.Invert({})
	];
	before[2].enabled = false;

	const text = CLARITY.formatChain(before);
	assert.equal(text, 'Blur,radius=8/Desaturate,amount=0.4/Invert!off');

	const after = CLARITY.buildChain(text);
	assert.equal(after.length, 3);
	assert.equal(after[0].properties.radius, 8);
	assert.equal(after[1].properties.amount, 0.4, 'a decimal point must survive the format');
	assert.equal(after[2].enabled, false);

	// and the text is stable: formatting what was parsed gives the same string
	assert.equal(CLARITY.formatChain(after), text);
});

test('only non-default properties are written', () => {
	// keeps a link short, and keeps it working when a default changes underneath
	assert.equal(CLARITY.formatChain([new CLARITY.Blur({})]), 'Blur');
	assert.equal(CLARITY.formatChain([new CLARITY.Mirror({ horizontal: true })]), 'Mirror');
	assert.equal(CLARITY.formatChain([new CLARITY.Mirror({ horizontal: false })]), 'Mirror,horizontal=false');
});

test('reading a chain is forgiving, because the text comes from outside', () => {
	// a URL or an attribute written against a different version of the library
	assert.deepEqual(CLARITY.parseChain('Nonexistent,foo=1').length, 0);
	assert.deepEqual(
		CLARITY.buildChain('Invert/Nonexistent/Blur').map((f) => f.constructor.name),
		['Invert', 'Blur']
	);

	// a mangled value is clamped by setProperty rather than throwing
	assert.equal(CLARITY.buildChain('Blur,radius=99999')[0].properties.radius, CLARITY.Blur.schema.radius.max);
	// and an unknown property is ignored rather than being an error
	assert.equal(CLARITY.buildChain('Blur,nonsense=3').length, 1);
});

test('a property a filter does not declare is skipped, whatever it is called', () => {
	// `channel` used to be waved past the schema guard on the grounds that it
	// lives on the base class - and then setProperty threw, because the guard
	// there is the filter's own schema. So `Blur,nonsense=1` was forgiven and
	// `Blur,channel=red` was fatal: the one shape of stale link most likely to
	// exist, since channel *is* a real option on other filters.
	for (const name of Object.keys(CLARITY.FILTERS)) {
		if ('channel' in CLARITY.FILTERS[name].schema) continue;
		assert.doesNotThrow(
			() => CLARITY.buildChain(`${name},channel=red`),
			`${name},channel=red should be skipped, not fatal`
		);
	}

	// where it is declared it still works, and still round-trips
	assert.equal(CLARITY.buildChain('EdgeDetector,channel=red')[0].channel, 'red');
	assert.equal(CLARITY.formatChain(CLARITY.buildChain('EdgeDetector,channel=red')), 'EdgeDetector,channel=red');
});

// --- documentation completeness ---------------------------------------
//
// The filter reference is generated from this metadata, so a missing
// description is not a cosmetic problem - it is a blank cell in the docs and a
// control in the playground with no tooltip. Failing here is what makes
// "the docs write themselves" true rather than "the docs generate themselves
// empty".

test('every schema field says what it does', () => {
	const missing = [];
	for (const name of filterNames) {
		const schema = CLARITY.FILTERS[name].schema ?? {};
		for (const [key, field] of Object.entries(schema)) {
			if (typeof field.description !== 'string' || field.description.trim() === '') {
				missing.push(`${name}.${key}`);
			}
			if (typeof field.label !== 'string' || field.label.trim() === '') {
				missing.push(`${name}.${key} (no label)`);
			}
		}
	}
	assert.deepEqual(missing, [], 'schema fields with no description');
});

test('every filter is in the catalogue, with a summary', () => {
	const missing = filterNames.filter((name) => !CLARITY.CATALOGUE[name]?.summary?.trim());
	assert.deepEqual(missing, [], 'filters with no catalogue summary');

	// and nothing in the catalogue has outlived the filter it describes
	const orphaned = Object.keys(CLARITY.CATALOGUE).filter((name) => !filterNames.includes(name));
	assert.deepEqual(orphaned, [], 'catalogue entries with no filter');
});

test('declared traits agree with what the filters actually are', () => {
	// Three of the traits restate something the code already knows, so they can
	// be checked rather than trusted. The rest - what kind of image a filter
	// wants - is a claim about meaning that nothing in the code can confirm,
	// which is exactly why it has to be written down.
	const wrong = [];
	const has = (name, trait) => (CLARITY.CATALOGUE[name].traits ?? []).includes(trait);

	for (const name of filterNames) {
		const Ctor = CLARITY.FILTERS[name];
		const entry = CLARITY.CATALOGUE[name];

		for (const trait of entry.traits ?? []) {
			if (!(trait in CLARITY.TRAITS)) wrong.push(`${name}: unknown trait "${trait}"`);
		}

		const derived = {
			starter: entry.category === 'Starters',
			dual: entry.category === 'Dual Input',
			// `stateful` is the property that means "output depends on frames
			// already seen", which is what the chip is warning about. This used
			// to derive from `retains` instead, which is only the commonest
			// *implementation* of that - ShotDetector keeps a thumbnail rather
			// than frame history, and was temporal in every sense but the test's.
			temporal: Ctor.stateful
		};
		for (const [trait, expected] of Object.entries(derived)) {
			if (has(name, trait) !== expected) {
				wrong.push(`${name}: ${expected ? 'should' : 'should not'} be tagged "${trait}"`);
			}
		}
	}
	assert.deepEqual(wrong, []);
});

test('every trait in the vocabulary is used, and describes itself', () => {
	const used = new Set(Object.values(CLARITY.CATALOGUE).flatMap((entry) => entry.traits ?? []));
	for (const [trait, info] of Object.entries(CLARITY.TRAITS)) {
		assert.ok(info.label?.trim(), `${trait} has no label`);
		assert.ok(info.description?.trim(), `${trait} has no description`);
		// an unused trait is a vocabulary word nobody needed - drop it rather
		// than leave it to be mistakenly applied later
		assert.ok(used.has(trait), `trait "${trait}" is declared but tags no filter`);
	}
});
