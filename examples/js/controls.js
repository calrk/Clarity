// Renders a filter's controls from its schema.
//
// This is deliberately *example* code rather than part of the library. Clarity
// used to ship a `doCreateControls` on every filter, which meant importing it
// pulled in a DOM dependency and 550 lines of near-identical DOM building, and
// every app was stuck with the markup those 34 methods happened to produce.
//
// The library now ships only the metadata - what each property is, what it
// means and what values are legal - and anything that wants a UI renders it.
// This file is one such renderer, in about 90 lines of plain DOM, and it works
// for every filter including the several that never had controls before.
//
// A framework version is shorter still: iterate `Filter.schema` and bind each
// field to `filter.setProperty(key, value)`.

/**
 * @param {object} filter   a Clarity filter instance
 * @param {string} [title]  heading text; defaults to the class name
 * @returns {HTMLElement}
 */
function createControls(filter, title) {
	var schema = filter.schema;

	var group = document.createElement('div');
	group.className = 'clarity-controlGroup';

	var heading = document.createElement('h3');
	heading.className = 'clarity-title';
	heading.textContent = title || filter.constructor.name;

	var enabled = document.createElement('input');
	enabled.className = 'clarity-checkbox';
	enabled.type = 'checkbox';
	enabled.checked = filter.enabled;
	enabled.addEventListener('change', function () {
		filter.enabled = enabled.checked;
	});
	heading.appendChild(enabled);
	group.appendChild(heading);

	var keys = Object.keys(schema);
	if (!keys.length) {
		group.appendChild(label('No options.'));
		return group;
	}

	keys.forEach(function (key) {
		group.appendChild(createField(filter, key, schema[key]));
	});

	return group;
}

function label(text, title) {
	var el = document.createElement('label');
	el.className = 'clarity-label';
	el.textContent = text;
	if (title) el.title = title;
	return el;
}

function createField(filter, key, field) {
	var row = document.createElement('div');
	row.className = 'clarity-control';
	row.appendChild(label(field.label, field.description));

	if (field.type === 'bool') {
		var check = document.createElement('input');
		check.className = 'clarity-checkbox';
		check.type = 'checkbox';
		check.checked = filter.getProperty(key);
		check.addEventListener('change', function () {
			filter.setProperty(key, check.checked);
		});
		row.appendChild(check);
		return row;
	}

	if (field.type === 'select') {
		var select = document.createElement('select');
		select.className = 'clarity-select';
		field.options.forEach(function (option) {
			var el = document.createElement('option');
			el.value = option.value;
			el.textContent = option.label;
			select.appendChild(el);
		});
		select.value = filter.getProperty(key);
		select.addEventListener('change', function () {
			filter.setProperty(key, select.value);
		});
		row.appendChild(select);
		return row;
	}

	// int and float differ only in step, which the schema already carries
	var slider = document.createElement('input');
	slider.className = 'clarity-slider';
	slider.type = 'range';
	slider.min = field.min;
	slider.max = field.max;
	slider.step = field.step;

	var readout = document.createElement('span');
	readout.className = 'clarity-value';

	// a nullable field needs a way back to null - ValueThreshold's auto mode
	var auto = null;
	if (field.nullable) {
		auto = document.createElement('input');
		auto.className = 'clarity-checkbox';
		auto.type = 'checkbox';
		row.appendChild(label(field.nullLabel || 'Auto'));
		row.appendChild(auto);
	}

	function show() {
		var value = filter.getProperty(key);
		var isNull = value === null;
		if (auto) {
			auto.checked = isNull;
			slider.disabled = isNull;
		}
		if (!isNull) slider.value = value;
		readout.textContent = isNull ? field.nullLabel || 'auto' : String(value);
	}

	slider.addEventListener('input', function () {
		filter.setProperty(key, slider.value);
		show();
	});
	if (auto) {
		auto.addEventListener('change', function () {
			// '' is what a cleared input sends, and the schema reads it as null
			filter.setProperty(key, auto.checked ? '' : slider.value);
			show();
		});
	}

	show();
	row.appendChild(slider);
	row.appendChild(readout);
	return row;
}

window.ClarityControls = { createControls: createControls };
