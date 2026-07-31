/**
 * Hand-rolled DOM builders for the per-filter control panels.
 *
 * Everything here is slated for removal - see FEATURES.md #8, which replaces
 * `doCreateControls` with declarative per-filter schemas rendered by the host
 * app. Until then it stays as-is so the existing examples keep working.
 *
 * Note these functions touch `document`, so they must only be called from a
 * browser. The rest of the library no longer requires a DOM.
 */
export const Interface = {
	createControlGroup(titleSet?: string, enabledFlag?: boolean): HTMLDivElement {
		const controls = document.createElement('div');
		controls.setAttribute('class', 'clarity-controlGroup');

		const title = document.createElement('h3');
		title.setAttribute('class', 'clarity-title');
		title.textContent = titleSet || 'Clarity Filter';
		controls.appendChild(title);

		const toggle = document.createElement('input');
		toggle.setAttribute('class', 'clarity-checkbox');
		toggle.setAttribute('type', 'checkbox');
		if (enabledFlag) {
			toggle.setAttribute('checked', 'checked');
		}
		title.appendChild(toggle);

		return controls;
	},

	createSlider(
		min: number,
		max: number,
		step: number,
		labelSet?: string,
		valueSet?: number
	): HTMLDivElement {
		const div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');

		const slider = document.createElement('input');
		slider.setAttribute('class', 'clarity-slider');
		slider.setAttribute('type', 'range');
		slider.setAttribute('min', String(min ?? 0));
		slider.setAttribute('max', String(max ?? 1));
		slider.setAttribute('step', String(step ?? 1));
		if (valueSet !== undefined) {
			slider.setAttribute('value', String(valueSet));
		}

		if (labelSet) {
			const label = document.createElement('label');
			label.setAttribute('class', 'clarity-label');
			label.textContent = labelSet;
			div.appendChild(label);
		}

		div.appendChild(slider);
		return div;
	},

	createToggle(labelSet?: string, checked?: boolean): HTMLDivElement {
		const div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');

		const toggle = document.createElement('input');
		toggle.setAttribute('class', 'clarity-checkbox');
		toggle.setAttribute('type', 'checkbox');
		if (checked) {
			toggle.setAttribute('checked', 'checked');
		}

		if (labelSet) {
			const label = document.createElement('label');
			label.setAttribute('class', 'clarity-label');
			label.textContent = labelSet;
			div.appendChild(label);
		}
		div.appendChild(toggle);
		return div;
	},

	createBreak(): HTMLBRElement {
		return document.createElement('br');
	},

	createDiv(): HTMLDivElement {
		return document.createElement('div');
	},

	createLabel(labelSet: string): HTMLDivElement {
		const div = document.createElement('div');
		div.setAttribute('class', 'clarity-control');

		const label = document.createElement('label');
		label.setAttribute('class', 'clarity-label');
		label.textContent = labelSet;

		div.appendChild(label);
		return div;
	}
};

/**
 * Reads the value from a control built by {@link Interface}. The old code used
 * `e.srcElement`, a non-standard alias, and half the filters attached their
 * listener to the wrapper div rather than the input.
 */
export function controlValue(event: Event): string {
	return (event.target as HTMLInputElement).value;
}
