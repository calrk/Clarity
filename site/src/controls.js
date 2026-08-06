// Renders a filter's controls from its schema.
//
// Clarity ships no UI code - the library carries only the metadata, so this is
// a consumer of it rather than part of it. Which is the whole argument for
// declarative schemas: this file handles every filter in the library, including
// the several that never had controls at all, and a new filter gets a UI the
// moment it declares a schema.
//
// Always write through `setProperty`. It coerces per the schema and clamps to
// the declared range - a range input hands back a *string*, and `radius: "10"`
// works in some arithmetic and silently breaks the rest.

/**
 * @param {object} filter  a Clarity filter instance
 * @param {() => void} onChange  called after any property changes
 * @returns {HTMLElement}
 */
export function createControls(filter, onChange) {
	const body = document.createElement('div');
	body.className = 'stage-body';

	const keys = Object.keys(filter.schema);
	if (!keys.length) {
		const none = document.createElement('p');
		none.className = 'no-options';
		none.textContent = 'No options.';
		body.appendChild(none);
		return body;
	}

	for (const key of keys) {
		body.appendChild(field(filter, key, filter.schema[key], onChange));
	}
	return body;
}

function label(text, title) {
	const el = document.createElement('span');
	el.className = 'label';
	el.textContent = text;
	if (title) el.title = title;
	return el;
}

function field(filter, key, spec, onChange) {
	const row = document.createElement('div');
	row.className = 'control';

	if (spec.type === 'bool') {
		row.classList.add('inline');
		row.appendChild(label(spec.label, spec.description));

		const check = document.createElement('input');
		check.type = 'checkbox';
		check.checked = filter.getProperty(key);
		check.addEventListener('change', () => {
			filter.setProperty(key, check.checked);
			onChange();
		});
		row.appendChild(check);
		return row;
	}

	if (spec.type === 'select') {
		row.appendChild(label(spec.label, spec.description));
		row.appendChild(document.createElement('span'));

		const select = document.createElement('select');
		for (const option of spec.options) {
			const el = document.createElement('option');
			el.value = option.value;
			el.textContent = option.label;
			select.appendChild(el);
		}
		select.value = filter.getProperty(key);
		select.addEventListener('change', () => {
			filter.setProperty(key, select.value);
			onChange();
		});
		row.appendChild(select);
		return row;
	}

	if (spec.type === 'colour') {
		row.classList.add('inline');
		row.appendChild(label(spec.label, spec.description));

		// The schema stores six hex digits with no hash; `<input type="color">`
		// insists on the hash in both directions, so it is added on the way in and
		// stripped on the way out rather than stored either way.
		const picker = document.createElement('input');
		picker.type = 'color';
		picker.value = `#${filter.getProperty(key)}`;
		picker.addEventListener('input', () => {
			filter.setProperty(key, picker.value.replace('#', ''));
			onChange();
		});
		row.appendChild(picker);
		return row;
	}

	// int and float differ only in step, which the schema already carries
	const name = label(spec.label, spec.description);
	const readout = document.createElement('span');
	readout.className = 'value';

	const slider = document.createElement('input');
	slider.type = 'range';
	slider.min = spec.min;
	slider.max = spec.max;
	slider.step = spec.step;

	// a nullable field needs a way back to null - ValueThreshold's auto mode
	let auto = null;
	if (spec.nullable) {
		auto = document.createElement('input');
		auto.type = 'checkbox';
		auto.title = `${spec.nullLabel ?? 'Auto'} - ${spec.description ?? ''}`;
	}

	function show() {
		const value = filter.getProperty(key);
		const isNull = value === null;
		if (auto) {
			auto.checked = isNull;
			slider.disabled = isNull;
		}
		if (!isNull) slider.value = value;
		readout.textContent = isNull ? (spec.nullLabel ?? 'auto') : String(value);
	}

	slider.addEventListener('input', () => {
		filter.setProperty(key, slider.value);
		show();
		onChange();
	});

	row.appendChild(name);
	if (auto) {
		const wrap = document.createElement('span');
		wrap.className = 'value';
		wrap.append(readout, ' ', auto);
		row.appendChild(wrap);
		auto.addEventListener('change', () => {
			// '' is what a cleared input sends, and the schema reads that as null
			filter.setProperty(key, auto.checked ? '' : slider.value);
			show();
			onChange();
		});
	} else {
		row.appendChild(readout);
	}
	row.appendChild(slider);

	show();
	return row;
}
