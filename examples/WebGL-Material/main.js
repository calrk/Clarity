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
		name: "Dot Remover (Black & White Only)",
		id: "dot",
		filter: new CLARITY.DotRemover()
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
	{
		name: "HSV Shift",
		id: "hsvshift",
		filter: new CLARITY.hsvShifter({hue:300})
	},
];

var ctx;
var canvas;
var canvas2;
var ctx2;
var width;
var height;

var scene;
var camera;
var renderer;
var clock;

var texture;
var sphere;
var cube;
var needsUpdate = true;

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
			// render();
			needsUpdate = true;
		}

		filters[i].position = i;
		filters[i].active = false;
	}

	canvas = document.querySelector('#canvas');
	canvas2 = document.querySelector('#canvas2');
	ctx2 = canvas2.getContext('2d');

	width = canvas.width;
	height = canvas.height;

	canvas.onclick = function(e){
		filters.forEach(function(filter){
			if(typeof filter.setClick === 'function')
				filter.filter.setClick([e.clientX, e.clientY]);
		});
		// render();
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
	renderer.setClearColor(0x999999, 0);

	texture = new THREE.Texture();
	
	sphere = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), new THREE.MeshLambertMaterial({color: 0xFFFFFF}));
	sphere.material.map = texture;
	scene.add(sphere);

	cube = new THREE.Mesh(new THREE.CubeGeometry(8, 8, 8), new THREE.MeshLambertMaterial({color: 0xFFFFFF}));
	cube.material.map = texture;
	cube.position.x = 11;
	scene.add(cube);

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

	renderer.render(scene, camera);

	sphere.rotation.y += 0.01;
	cube.rotation.y   += 0.01;

	if(needsUpdate){
		updateTexture();
	}
}

function updateTexture(){
	var img = document.getElementById("image");
	ctx2.drawImage(img, 0, 0, width, height);
	var frame = ctx2.getImageData(0,0,width,height);

	for(var i = 0; i < filters.length; i++){
		if(filters[i].active){
			frame = filters[i].filter.process(frame);
		}
	}

	ctx2.putImageData(frame, 0, 0);

	var img = canvas2.toDataURL("image/png");
	var imageOut = document.getElementById("imageOut");
	imageOut.src = img;
	texture.image = imageOut;
	texture.needsUpdate = true;
	needsUpdate = false;
}

window.onload = init;