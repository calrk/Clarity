var filters = [
	{
		name: "Average Thresholder",
		id: "avThresh",
		filter: new CLARITY.ValueThreshold({thresh:64, channel:'red'})
	},
	{
		name: "Smoother",
		id: "smooth",
		filter: new CLARITY.Smoother()
	},
	{
		name: "Motion Detector",
		id: "motion",
		filter: new CLARITY.MotionDetector()
	},
	{
		name: "Edge Detector",
		id: "edge",
		filter: new CLARITY.EdgeDetector({efficient:true})
	},
	{
		name: "Gradient Thresholder",
		id: "gradThresh",
		filter: new CLARITY.GradientThreshold()
	},
	{
		name: "Median Thresholder",
		id: "medThresh",
		filter: new CLARITY.MedianThreshold()
	},
	{
		name: "Posteriser",
		id: "posterise",
		filter: new CLARITY.Posteriser()
	},
	{
		name: "Skin Detector",
		id: "skin",
		filter: new CLARITY.SkinDetector()
	},
	{
		name: "Dot Remover (Black & White Only)",
		id: "dot",
		filter: new CLARITY.DotRemover()
	},
	{
		name: "Ghoster",
		id: "ghost",
		filter: new CLARITY.Ghoster()
	},
	{
		name: "Puzzler",
		id: "puzzler",
		filter: new CLARITY.Puzzler()
	},
];

var canvas;
var ctx;
var video;
var width;
var height;

function init(){
	$("#shuffle").sortable({update:function(event, ui){shuffleChanged()}});
	$("#shuffle").disableSelection();

	for(var i = 0; i < filters.length; i++){
		var newLi = document.createElement('li');
		newLi.className = "listRed";
		newLi.innerHTML = filters[i].name;
		newLi.id = filters[i].id;
		$("#shuffle")[0].appendChild(newLi);

		newLi.onclick = function(e){
			filters.forEach(function(filter){
				if(filter.id == e.srcElement.id){
		        	filter.filter.toggleEnabled();
					if(filter.filter.active){
						e.srcElement.className = "listGreen";
					}
					else{
						e.srcElement.className = "listRed";
					}
				}
			});
		}

		filters[i].position = i;
		filters[i].active = false;
	}

	video = document.querySelector("#vid");
	video.volume = 0;
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

	requestAnimationFrame(render);
}

function shuffleChanged(){
	var elements = document.getElementsByTagName('li');

	for(var i = 0; i < elements.length; i++){
		if(elements[i].id != filters[i].id){
			for(var j in filters){
				if(elements[i].id == filters[j].id){
					filters[j].position = i;
					break;
				}
			}
		}
	};

	filters.sort(compareFilters);
}

function compareFilters(first, second){
	return first.position > second.position;
}

function printFilters(){
	for(var i = 0; i < filters.length; i++){
		console.log(filters[i].id);
	}
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