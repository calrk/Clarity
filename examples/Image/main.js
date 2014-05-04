var filters = [
	{
		name: "Average Thresholder",
		id: "avThresh",
		filter: new CLARITY.AverageThreshold({thresh:64, channel:'red'})
	},
	{
		name: "Smoother",
		id: "smooth",
		filter: new CLARITY.Smoother()
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
		name: "Puzzler",
		id: "puzzler",
		filter: new CLARITY.Puzzler()
	},
	{
		name: "Translator",
		id: "trans",
		filter: new CLARITY.Translator()
	},
	{
		name: "Rotator",
		id: "rotate1",
		filter: new CLARITY.Rotator({turns:1})
	},
	{
		name: "Mirror",
		id: "mirror",
		filter: new CLARITY.Mirror()
	},
];

var canvas;
var ctx;
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
					filter.active = !filter.active;
					if(filter.active){
						e.srcElement.className = "listGreen";
					}
					else{
						e.srcElement.className = "listRed";
					}
				}
			});
			render();
		}

		filters[i].position = i;
		filters[i].active = false;
	}

	canvas = document.querySelector('#canvas');
	ctx = canvas.getContext('2d');
	width = canvas.width;
	height = canvas.height;

	canvas.onclick = function(e){
		filters.forEach(function(filter){
			if(typeof filter.setClick === 'function')
				filter.filter.setClick([e.clientX, e.clientY]);
		});
		render();
	}

	render();
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

function render(){
	var img = document.getElementById("image");
	
	ctx.drawImage(img, 0, 0, width, height);

	var frame = ctx.getImageData(0,0,width,height);

	for(var i = 0; i < filters.length; i++){
		if(filters[i].active){
			frame = filters[i].filter.process(frame);
		}
	}

	ctx.putImageData(frame, 0, 0);
}

window.onload = init;