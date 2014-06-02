var filters = [
	{
		name: "Average Thresholder",
		id: "avThresh",
		filter: new CLARITY.ValueThreshold({thresh:64, channel:'red', enabled:false})
	},
	{
		name: "Smoother",
		id: "smooth",
		filter: new CLARITY.Smoother({enabled:false})
	},
	{
		name: "Motion Detector",
		id: "motion",
		filter: new CLARITY.MotionDetector({enabled:false})
	},
	{
		name: "Edge Detector",
		id: "edge",
		filter: new CLARITY.EdgeDetector({efficient:true, enabled:false})
	},
	{
		name: "Gradient Thresholder",
		id: "gradThresh",
		filter: new CLARITY.GradientThreshold({enabled:false})
	},
	{
		name: "Median Thresholder",
		id: "medThresh",
		filter: new CLARITY.MedianThreshold({enabled:false})
	},
	{
		name: "Posteriser",
		id: "posterise",
		filter: new CLARITY.Posteriser({enabled:false})
	},
	{
		name: "Skin Detector",
		id: "skin",
		filter: new CLARITY.SkinDetector({enabled:false})
	},
	{
		name: "Dot Remover (Black & White Only)",
		id: "dot",
		filter: new CLARITY.DotRemover({enabled:false})
	},
	{
		name: "Ghoster",
		id: "ghost",
		filter: new CLARITY.Ghoster({enabled:false})
	},
	{
		name: "Puzzler",
		id: "puzzler",
		filter: new CLARITY.Puzzler({enabled:false})
	},
];

var ctx;
var canvas;
var ctx2;
var width;
var height;

var scene;
var camera;
var renderer;
var clock;

var spherer;
var sphereg;
var sphereb;

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
					if(filter.filter.enabled){
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

	canvas = document.querySelector('#canvas');
	ctx2 = document.querySelector('#canvas2').getContext('2d');
	width = canvas.width;
	height = canvas.height;

	canvas.onclick = function(e){
		filters.forEach(function(filter){
			if(typeof filter.setClick === 'function')
				filter.filter.setClick([e.clientX, e.clientY]);
		});
	}

	//THREE.js stuff
	renderer = new THREE.WebGLRenderer({antialias:true, canvas: canvas});
	camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 100);
	scene = new THREE.Scene();
	light = new THREE.PointLight(0xFFFFFF, 1);
	clock = new THREE.Clock()
	clock.start();
	camera.add(light);
	scene.add(camera);
	camera.position.z = 20;
	renderer.setSize(width, height);
	renderer.setClearColor(0x000000, 0);

	spherer = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), new THREE.MeshLambertMaterial({color: 0xFF0000}));
	sphereg = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), new THREE.MeshLambertMaterial({color: 0x00FF00}));
	sphereb = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), new THREE.MeshLambertMaterial({color: 0x0000FF}));
	scene.add(spherer);
	scene.add(sphereg);
	scene.add(sphereb);
	spherer.position.x = -12;
	sphereb.position.x = 12;

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
	requestAnimationFrame(render);

	var pos = clock.getElapsedTime();
	spherer.position.y =  Math.sin(pos*2)*5;
	sphereg.position.y =  Math.cos(pos*2)*5;
	sphereb.position.y = -Math.sin(pos*2)*5;

	renderer.render(scene, camera);

	ctx2.drawImage(canvas, 0, 0);

	var frame = ctx2.getImageData(0,0,width,height);

	for(var i = 0; i < filters.length; i++){
		frame = filters[i].filter.process(frame);
	}

	ctx2.putImageData(frame, 0, 0);
}

window.onload = init;