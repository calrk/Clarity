var filters = [
	{
		name: "Desaturate",
		filter: new CLARITY.Desaturate()
	},
	{
		name: "Value Thresholder",
		filter: new CLARITY.ValueThreshold()
	},
	{
		name: "Smoother",
		filter: new CLARITY.Smoother()
	},
	{
		name: "HSV Shift",
		filter: new CLARITY.hsvShifter({hue:300})
	},
	{
		name: "Motion Detector",
		filter: new CLARITY.MotionDetector()
	},
	{
		name: "Edge Detector",
		filter: new CLARITY.EdgeDetector({fast:false})
	},
	{
		name: "Sharpen",
		filter: new CLARITY.Sharpen({intensity: 0.5})
	},
	{
		name: "Gradient Thresholder",
		filter: new CLARITY.GradientThreshold()
	},
	{
		name: "Median Thresholder",
		filter: new CLARITY.MedianThreshold()
	},
	{
		name: "Posteriser",
		filter: new CLARITY.Posteriser({colours: 10})
	},
	{
		name: "Dot Remover (Black & White Only)",
		filter: new CLARITY.DotRemover()
	},
	{
		name: "Ghoster",
		filter: new CLARITY.Ghoster()
	},
	{
		name: "Puzzler",
		filter: new CLARITY.Puzzler()
	},
	{
		name: "Translator",
		filter: new CLARITY.Translator()
	},
	{
		name: "Rotator",
		filter: new CLARITY.Rotator()
	},
	{
		name: "Mirror",
		filter: new CLARITY.Mirror()
	},
	{
		name: "Tiler",
		filter: new CLARITY.Tiler()
	},
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