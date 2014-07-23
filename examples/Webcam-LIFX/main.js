var filters = [
	{
		name: "Motion Detector",
		filter: new CLARITY.MotionDetector({enabled:true})
	},
	{
		name: "Value Thresholder",
		filter: new CLARITY.ValueThreshold({threshold:50, enabled:true})
	},
	{
		name: "LIFX",
		filter: new CLARITY.LIFX({enabled:true})
	},
];

var canvas;
var ctx;
var ctxcol;
var localMediaStream = null;
var video;
var width;
var height;

var RGBfilter = new CLARITY.FillRGB({enabled:true});
var blender = new CLARITY.Blend();

function init(){
	for(var i = 0; i < filters.length; i++){
		var controls = filters[i].filter.createControls(filters[i].name);
		document.getElementById('controls').appendChild(controls);
	}

	video = document.querySelector("#vid");
	canvas = document.querySelector('#canvas');
	ctx = canvas.getContext('2d');
	ctxcol = document.querySelector('#canvasCol').getContext('2d');
	width = canvas.width;
	height = canvas.height;

	canvas.onclick = function(e){
		filters.forEach(function(filter){
			if(typeof filter.setClick === 'function')
				filter.filter.setClick([e.clientX, e.clientY]);
		});
	}
	/*canvas.onmousemove = function(event){
		var u = (event.pageX-2)/width-0.5;
		var v = (event.pageY-2)/height-0.5;

		var rgb = CLARITY.Operations.YUVtoRGB({y:0.5, u:u, v:-v});

		RGBfilter.setInt('red', rgb.r*255);
		RGBfilter.setInt('green', rgb.g*255);
		RGBfilter.setInt('blue', rgb.b*255);
	}*/

	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	window.URL = window.URL || window.webkitURL;
	navigator.getUserMedia({video:true}, function (stream){
		video.src = window.URL.createObjectURL(stream);
		localMediaStream = stream;
	}, onCameraFail);

	requestAnimationFrame(render);
}

var cooldown = 0;
function render(){
	requestAnimationFrame(render);
	
	ctx.drawImage(video, 0, 0, width, height);
	ctxcol.drawImage(video, 0, 0, width, height);

	var frame = ctx.getImageData(0,0,width,height);
	var colframe = ctx.getImageData(0,0,width,height);

	for(var i = 0; i < filters.length; i++){
		frame = filters[i].filter.process(frame);
	}
	// colframe = RGBfilter.process(frame);
	var rgb = filters[2].filter.getRGB();
	RGBfilter.setInt('red', rgb.r);
	RGBfilter.setInt('green', rgb.g);
	RGBfilter.setInt('blue', rgb.b);

	ctx.putImageData(frame, 0, 0);

	/* var flatColFrame = RGBfilter.process(frame);
	var blended = blender.process([flatColFrame, colframe]);
	ctxcol.putImageData(blended, 0, 0);*/

	var hsv = CLARITY.Operations.RGBtoHSV([rgb.r,rgb.g,rgb.b]);
	hsv[0] = CLARITY.Operations.clamp(hsv[0], 0, 360);
	hsv[1] = CLARITY.Operations.clamp(hsv[1], 0, 1);
	hsv[2] = CLARITY.Operations.clamp(hsv[2], 0, 1);
	// cooldown ++;
	// if(cooldown > 5){
		console.log('posting: ' + hsv);
		$.post('http://localhost:3000/lights', {hsv:hsv}, function(err, res){
			console.log(res);
		});
		cooldown = 0;
	// }
}

function onCameraFail(e){
	console.log("Camera did not work: ", e);
}

window.onload = init;