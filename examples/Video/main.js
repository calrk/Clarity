// Filters over a playing video.
//
// Same shape as the Image example, with two differences: the source is live, so
// every frame is read fresh and the pipeline cache can never hit, and the
// Renderer drives its own requestAnimationFrame loop rather than the example
// hand-rolling one.

var filters = [
	// was `{thresh: 64}`, which is not an option this filter has
	{ name: 'Value Thresholder', filter: new CLARITY.ValueThreshold({ threshold: 64, channel: 'red', enabled: false }) },
	{ name: 'Smoother', filter: new CLARITY.Smoother({ enabled: false }) },
	{ name: 'Motion Detector', filter: new CLARITY.MotionDetector({ enabled: false }) },
	{ name: 'Edge Detector', filter: new CLARITY.EdgeDetector({ fast: true, enabled: false }) },
	{ name: 'Gradient Thresholder', filter: new CLARITY.GradientThreshold({ enabled: false }) },
	{ name: 'Median Thresholder', filter: new CLARITY.MedianThreshold({ enabled: false }) },
	{ name: 'Posteriser', filter: new CLARITY.Posteriser({ enabled: false }) },
	{ name: 'Skin Detector', filter: new CLARITY.SkinDetector({ enabled: false }) },
	{ name: 'Dot Remover (binary images only)', filter: new CLARITY.DotRemover({ enabled: false }) },
	{ name: 'Ghoster', filter: new CLARITY.Ghoster({ enabled: false }) },
	{ name: 'Puzzler', filter: new CLARITY.Puzzler({ enabled: false }) }
];

var renderer;

function init() {
	var canvas = document.querySelector('#canvas');
	var video = document.querySelector('#vid');
	video.volume = 0;

	renderer = new CLARITY.Renderer(canvas);
	filters.forEach(function (entry) {
		renderer.add(entry.filter);
	});
	renderer.source(video);

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
			// tested `filter.setClick` on the wrapper rather than the filter, so
			// it never fired; clientX/Y are page coordinates, not canvas ones
			if (typeof filter.setClick === 'function') {
				filter.setClick([e.offsetX, e.offsetY]);
			}
		});
	};

	renderer.start();
	reportStats();
}

function reportStats() {
	var readout = document.getElementById('stats');
	if (!readout) {
		return;
	}

	setInterval(function () {
		var stats = renderer.stats;
		readout.textContent =
			'last frame: ' + stats.total.toFixed(1) + 'ms over ' + renderer.pipeline.length + ' stages';
	}, 500);
}

window.onload = init;
