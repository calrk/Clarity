var filters = [
	{
		name: "Channel Separate",
		filter: new CLARITY.ChannelSeparate({enabled:false})
	},
	{
		name: "Hanover Bars",
		filter: new CLARITY.HanoverBars({enabled:false})
	},
	{
		name: "Invert",
		filter: new CLARITY.Invert({dynamic: true, enabled:false})
	},
	{
		name: "Desaturate",
		filter: new CLARITY.Desaturate({enabled:false})
	},
	{
		name: "Glow",
		filter: new CLARITY.Glow({enabled:false})
	},
	{
		name: "Stack Blur",
		filter: new CLARITY.Blur({enabled:false})
	},
	{
		name: "Noise",
		filter: new CLARITY.Noise({enabled:false, intensity: 10})
	},
	{
		name: "Bleed",
		filter: new CLARITY.Bleed({enabled:false})
	},
	{
		name: "Waver",
		filter: new CLARITY.Wave({vertical: true, enabled:false})
	},
	{
		name: "Value Thresholder",
		filter: new CLARITY.ValueThreshold({enabled:false})
	},
	{
		name: "Smoother",
		filter: new CLARITY.Smoother({enabled:false})
	},
	{
		name: "HSV Shift",
		filter: new CLARITY.hsvShifter({hue:300, enabled:false})
	},
	{
		name: "Motion Detector",
		filter: new CLARITY.MotionDetector({enabled:false})
	},
	{
		name: "Edge Detector",
		filter: new CLARITY.EdgeDetector({fast:false, enabled:false})
	},
	{
		name: "Sharpen",
		filter: new CLARITY.Sharpen({intensity: 0.5, enabled:false})
	},
	{
		name: "Gradient Thresholder",
		filter: new CLARITY.GradientThreshold({enabled:false})
	},
	{
		name: "Median Thresholder",
		filter: new CLARITY.MedianThreshold({enabled:false})
	},
	{
		name: "Posteriser",
		filter: new CLARITY.Posteriser({colours: 10, enabled:false})
	},
	{
		name: "Dot Remover (Black & White Only)",
		filter: new CLARITY.DotRemover({enabled:false})
	},
	{
		name: "Ghoster",
		filter: new CLARITY.Ghoster({enabled:false})
	},
	{
		name: "Puzzler",
		filter: new CLARITY.Puzzler({enabled:false})
	},
	{
		name: "Translator",
		filter: new CLARITY.Translator({enabled:false})
	},
	{
		name: "Rotator",
		filter: new CLARITY.Rotator({enabled:false})
	},
	{
		name: "Mirror",
		filter: new CLARITY.Mirror({enabled:false})
	},
	{
		name: "Tiler",
		filter: new CLARITY.Tiler({enabled:false})
	},
];

var renderer;

function init() {
	var canvas = document.querySelector('#canvas');
	var video = document.querySelector('#vid');

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
			if (typeof filter.setClick === 'function') {
				filter.setClick([e.offsetX, e.offsetY]);
			}
		});
	};

	//getUserMedia + createObjectURL is the 2014 spelling; srcObject is the one
	//that still works, and the old form throws in current browsers
	navigator.mediaDevices
		.getUserMedia({ video: true })
		.then(function (stream) {
			video.srcObject = stream;
			video.play();
		})
		.catch(onCameraFail);

	renderer.start();
}

function onCameraFail(e) {
	console.log('Camera did not work: ', e);
}

window.onload = init;
