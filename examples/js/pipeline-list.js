// Drag-to-reorder filter list, wired to a Renderer.
//
// Every example used to carry its own copy of this: build the <li> elements,
// wire jQuery UI sortable, then a `shuffleChanged` that walked the DOM matching
// element ids back to a `position` field, sorted the array by it, and hoped the
// two lists had stayed in step. Four copies of the same 40 lines.
//
// A Renderer owns the order now, so reordering is `renderer.move(from, to)` and
// there is nothing to keep in step.
//
// Like controls.js, this is example code rather than library code - the library
// ships the Renderer and stays out of the DOM.

/**
 * @param {object} options
 * @param {object} options.renderer  a CLARITY.Renderer
 * @param {string[]} [options.names] display name per filter, defaulting to the class name
 * @param {HTMLElement} options.list  the <ul> to fill
 * @param {HTMLElement} [options.controls]  container for the per-filter control panels
 */
function createPipelineList(options) {
	var renderer = options.renderer;
	var list = options.list;
	var names = options.names || [];

	function nameOf(index) {
		return names[index] || renderer.pipeline.at(index).constructor.name;
	}

	renderer.pipeline.filters.forEach(function (filter, index) {
		var item = document.createElement('li');
		item.className = filter.enabled ? 'listGreen' : 'listRed';
		item.textContent = nameOf(index);

		item.onclick = function () {
			// the Renderer's list is the source of truth, so look the filter up
			// by its position now rather than trusting a captured index
			var current = renderer.pipeline.at(indexOf(item));
			current.enabled = !current.enabled;
			item.className = current.enabled ? 'listGreen' : 'listRed';
			renderer.render();
		};

		list.appendChild(item);

		if (options.controls) {
			options.controls.appendChild(ClarityControls.createControls(filter, nameOf(index)));
		}
	});

	function indexOf(item) {
		return Array.prototype.indexOf.call(list.children, item);
	}

	if (window.jQuery && jQuery(list).sortable) {
		var startedAt = -1;
		jQuery(list)
			.sortable({
				start: function (event, ui) {
					startedAt = ui.item.index();
				},
				update: function (event, ui) {
					renderer.move(startedAt, ui.item.index());
					renderer.render();
				}
			})
			.disableSelection();
	}

	return {
		/** Re-reads enabled state onto the list, after something else changed it. */
		refresh: function () {
			renderer.pipeline.filters.forEach(function (filter, index) {
				list.children[index].className = filter.enabled ? 'listGreen' : 'listRed';
			});
		}
	};
}

window.ClarityList = { create: createPipelineList };
