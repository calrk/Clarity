// Filters over a still image.
//
// The example is now the filter list plus a few lines of wiring: the Renderer
// owns the canvas, the ordered chain and the frame loop, and ClarityList wires
// drag-to-reorder and the enable toggles to it. The `shuffleChanged` /
// `compareFilters` pair that used to live here - matching <li> ids back to a
// `position` field and re-sorting the array - is gone; the Renderer holds the
// order, so there is nothing to keep in step with it.
//
// Note `live: false` on the source. A still image is read once, so the same
// frame object goes in every render and an unchanged chain costs nothing at
// all - the readout under the canvas shows it.

var filters = [
	{ name: 'Hanover', filter: new CLARITY.HanoverBars({ enabled: false }) },
	// was `{thresh: 64}`, which is not an option this filter has - it silently
	// did nothing and the threshold stayed on auto
	{ name: 'Value Thresholder', filter: new CLARITY.ValueThreshold({ threshold: 64, channel: 'red', enabled: false }) },
	{ name: 'Smoother', filter: new CLARITY.Smoother({ enabled: false }) },
	{ name: 'Edge Detector', filter: new CLARITY.EdgeDetector({ fast: true, enabled: false }) },
	{ name: 'Gradient Thresholder', filter: new CLARITY.GradientThreshold({ enabled: false }) },
	{ name: 'Median Thresholder', filter: new CLARITY.MedianThreshold({ enabled: false }) },
	{ name: 'Posteriser', filter: new CLARITY.Posteriser({ colours: 10, enabled: false }) },
	{ name: 'Skin Detector', filter: new CLARITY.SkinDetector({ enabled: false }) },
	{ name: 'Dot Remover (binary images only)', filter: new CLARITY.DotRemover({ enabled: false }) },
	{ name: 'Puzzler', filter: new CLARITY.Puzzler({ enabled: false }) },
	{ name: 'Translator', filter: new CLARITY.Translator({ enabled: false }) },
	{ name: 'Rotator', filter: new CLARITY.Rotator({ turns: 1, enabled: false }) },
	{ name: 'Mirror', filter: new CLARITY.Mirror({ enabled: false }) }
];

var renderer;

function init() {
	var canvas = document.querySelector('#canvas');

	renderer = new CLARITY.Renderer(canvas);
	filters.forEach(function (entry) {
		renderer.add(entry.filter);
	});
	renderer.source(document.getElementById('image'), { live: false });

	ClarityList.create({
		renderer: renderer,
		names: filters.map(function (entry) {
			return entry.name;
		}),
		list: document.getElementById('shuffle'),
		controls: document.getElementById('controls')
	});

	canvas.onclick = function (e) {
		renderer.pipeline.filters.forEach(function (filter) {
			// this used to test `filter.setClick` on the *wrapper* object rather
			// than on the filter, so it was never true and clicking Puzzler did
			// nothing. offsetX/Y are canvas coordinates; clientX/Y are not.
			if (typeof filter.setClick === 'function') {
				filter.setClick([e.offsetX, e.offsetY]);
				filter.dirty = true;
			}
		});
		renderer.render();
	};

	renderer.render();
	reportStats();
}

/** Re-renders once a second, to show the cache holding on a still image. */
function reportStats() {
	var readout = document.getElementById('stats');
	if (!readout) {
		return;
	}

	setInterval(function () {
		renderer.render();

		var stats = renderer.stats;
		readout.textContent =
			stats.from === -1
				? 'last render: nothing to do, all ' + stats.skipped + ' stages cached'
				: 'last render: ' + stats.total.toFixed(1) + 'ms, recomputed from stage ' +
					stats.from + ' of ' + renderer.pipeline.length + ' (' + stats.skipped + ' cached)';
	}, 1000);
}

window.onload = init;
