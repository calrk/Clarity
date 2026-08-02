// The pipeline, as a drag-to-reorder list.
//
// The sortable filter list was the best idea in the 2014 examples and it is
// still the best idea here - order is the whole grammar of the library, and
// dragging is the cheapest way to say so. What has changed is that the list is
// now a *view* of `renderer.pipeline` rather than the place the ordering lives,
// so reordering the DOM and reordering the chain cannot disagree.

import { createControls } from './controls.js';

const DUAL_INPUT = new Set(['Add', 'Subtract', 'Blend', 'Mask', 'Multiply']);

export function isDualInput(name) {
	return DUAL_INPUT.has(name);
}

/**
 * @param {HTMLElement} list
 * @param {object} handlers  { onMove, onRemove, onChange, onToggle, secondInputs, onSecondInput }
 */
export function createChainView(list, handlers) {
	let dragging = null;

	function render(filters, seconds) {
		list.replaceChildren();

		filters.forEach((filter, index) => {
			list.appendChild(card(filter, index, seconds));
		});
	}

	function card(filter, index, seconds) {
		const name = filter.constructor.name;

		const item = document.createElement('li');
		item.className = 'stage-card' + (filter.enabled ? '' : ' off');
		item.draggable = true;
		item.dataset.index = String(index);

		const head = document.createElement('div');
		head.className = 'stage-head';

		const grip = document.createElement('span');
		grip.className = 'grip';
		grip.textContent = '⠿';
		grip.setAttribute('aria-hidden', 'true');

		const title = document.createElement('span');
		title.className = 'stage-name';
		title.textContent = name;

		const power = document.createElement('button');
		power.className = 'icon-button';
		power.type = 'button';
		power.textContent = '◉';
		power.title = filter.enabled ? 'Bypass this filter' : 'Enable this filter';
		power.setAttribute('aria-pressed', String(filter.enabled));
		power.addEventListener('click', () => handlers.onToggle(index));

		const remove = document.createElement('button');
		remove.className = 'icon-button';
		remove.type = 'button';
		remove.textContent = '✕';
		remove.title = 'Remove';
		remove.addEventListener('click', () => handlers.onRemove(index));

		head.append(grip, title, power, remove);
		item.appendChild(head);

		// a two-input filter needs somewhere to get its second frame from, which
		// is a stage option rather than a property, so the schema knows nothing
		// about it
		if (isDualInput(name)) {
			const row = document.createElement('div');
			row.className = 'control';
			const spanLabel = document.createElement('span');
			spanLabel.className = 'label';
			spanLabel.textContent = 'Second input';
			row.append(spanLabel, document.createElement('span'));

			const select = document.createElement('select');
			for (const option of handlers.secondInputs) {
				const el = document.createElement('option');
				el.value = option.id;
				el.textContent = option.label;
				select.appendChild(el);
			}
			select.value = seconds.get(filter) ?? handlers.secondInputs[0].id;
			select.addEventListener('change', () => handlers.onSecondInput(index, select.value));
			row.appendChild(select);

			const body = document.createElement('div');
			body.className = 'stage-body';
			body.appendChild(row);
			item.appendChild(body);
		}

		item.appendChild(createControls(filter, handlers.onChange));

		item.addEventListener('dragstart', (event) => {
			dragging = index;
			item.classList.add('dragging');
			event.dataTransfer.effectAllowed = 'move';
			//Firefox will not start a drag without data on the transfer
			event.dataTransfer.setData('text/plain', name);
		});

		item.addEventListener('dragend', () => {
			dragging = null;
			item.classList.remove('dragging');
			clearMarkers();
		});

		item.addEventListener('dragover', (event) => {
			if (dragging === null || dragging === index) return;
			event.preventDefault();
			clearMarkers();
			item.classList.add(before(event, item) ? 'drop-before' : 'drop-after');
		});

		item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));

		item.addEventListener('drop', (event) => {
			if (dragging === null) return;
			event.preventDefault();
			clearMarkers();

			//the index a filter lands on is measured after it has been lifted out,
			//so dropping below its own position has to account for the gap it left
			let target = before(event, item) ? index : index + 1;
			if (dragging < target) target--;

			if (target !== dragging) handlers.onMove(dragging, target);
			dragging = null;
		});

		return item;
	}

	function before(event, item) {
		const box = item.getBoundingClientRect();
		return event.clientY < box.top + box.height / 2;
	}

	function clearMarkers() {
		for (const el of list.querySelectorAll('.drop-before, .drop-after')) {
			el.classList.remove('drop-before', 'drop-after');
		}
	}

	return { render };
}
