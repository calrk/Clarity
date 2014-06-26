var filters = [
	{
		name: "Channel Separate",
		filter: new CLARITY.ChannelSeparate({enabled:true})
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
	/*{
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
	},*/
];

var canvas;
var ctx;
var localMediaStream = null;
var video;
var width;
var height;

function init(){
	for(var i = 0; i < filters.length; i++){
		var controls = filters[i].filter.createControls(filters[i].name);
		document.getElementById('controls').appendChild(controls);
	}

	video = document.querySelector("#vid");
	canvas = document.querySelector('#canvas');
	ctx = canvas.getContext('2d');
	width = canvas.width;
	height = canvas.height;

	canvas.onclick = function(e){
		filters.forEach(function(filter){
			if(typeof filter.setClick === 'function')
				filter.filter.setClick([e.clientX, e.clientY]);
		});
	}

	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	window.URL = window.URL || window.webkitURL;
	navigator.getUserMedia({video:true}, function (stream){
		video.src = window.URL.createObjectURL(stream);
		localMediaStream = stream;
	}, onCameraFail);

	requestAnimationFrame(render);
}

function render(){
	requestAnimationFrame(render);
	
	ctx.drawImage(video, 0, 0, width, height);

	var frame = ctx.getImageData(0,0,width,height);

	for(var i = 0; i < filters.length; i++){
		frame = filters[i].filter.process(frame);
	}

	ctx.putImageData(frame, 0, 0);
}

function onCameraFail(e){
	console.log("Camera did not work: ", e);
}

window.onload = init;