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

var texFilters = [
	/*{
		name: "RGB",
		id: "RGB",
		filter: new CLARITY.FillRGB({red: 128, green:0, blue:0})
	},*/
	{
		name: "Cloud",
		id: "cloud",
		filter: new CLARITY.Cloud()
	},
	{
		name: "hsvShifter",
		id: "hsvshift",
		filter: new CLARITY.hsvShifter({value:2})
	},
	/*{
		name: "Translator",
		id: "trans",
		filter: new CLARITY.Translator({horizontal: 0.5})
	},*/
	{
		name: "Smooth",
		id: "smooth",
		filter: new CLARITY.Smoother()
	},
	/*{
		name: "Noise",
		id: "noise",
		filter: new CLARITY.Noise({intensity:50, monochromatic: false})
	},*/
]
var normalFilters = [
	/*{
		name: "Filler",
		id: "filler",
		filter: new CLARITY.FillRGB({red: 128, green:128, blue:255})
	},
	{
		name: "Noise",
		id: "noise",
		filter: new CLARITY.Noise({intensity:50, monochromatic: false})
	},
	{
		name: "Normal Intensity",
		id: "intens",
		filter: new CLARITY.NormalIntensity({intensity: 1})
	},*/
	{
		name: "Normal Generator",
		id: "gen",
		filter: new CLARITY.NormalGenerator()
	},
	{
		name: "Normal Intensity",
		id: "intens",
		filter: new CLARITY.NormalIntensity({intensity: 0.5})
	},
	/*{
		name: "Smooth",
		id: "smooth",
		filter: new CLARITY.Smoother()
	},*/
]

var canvas;
var canvasTex;
var canvasUV;
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

	/*for(var i = 0; i < filters.length; i++){
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
	}*/

	canvas = document.querySelector('#canvas');
	canvasTex = document.querySelector('#canvasTex');
	canvasUV = document.querySelector('#canvasUV');

	width = 512;
	height = 512;

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
	textureUV = new THREE.Texture();
	
	var material = new THREE.MeshPhongMaterial({color: 0xFFFFFF})
	material.map = texture;
	material.normalMap = textureUV;

	sphere = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), material);
	sphere.position.x = -6;
	scene.add(sphere);

	cube = new THREE.Mesh(new THREE.CubeGeometry(8, 8, 8), material);
	cube.position.x = 6;
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
		updateUV();
		needsUpdate = false;
	}
}

function updateTexture(){
	var img = document.getElementById("image");
	var ctx = canvasTex.getContext('2d');
	// ctx.drawImage(img, 0, 0, width, height);
	var frame = ctx.getImageData(0,0,width,height);

	for(var i = 0; i < texFilters.length; i++){
		frame = texFilters[i].filter.process(frame);
	}

	ctx.putImageData(frame, 0, 0);

	var img = canvasTex.toDataURL("image/png");
	var imageTex = document.getElementById("imageTex");
	imageTex.src = img;
	texture.image = imageTex;
	texture.needsUpdate = true;
}

function updateUV(){
	var img = document.getElementById("image");
	var ctx = canvasUV.getContext('2d');

	ctx.drawImage(canvasTex, 0, 0, width, height);
	var frame = ctx.getImageData(0,0,width,height);

	for(var i = 0; i < normalFilters.length; i++){
		frame = normalFilters[i].filter.process(frame);
	}

	ctx.putImageData(frame, 0, 0);

	var img = canvasUV.toDataURL("image/png");
	var imageUV = document.getElementById("imageUV");
	imageUV.src = img;
	textureUV.image = imageUV;
	textureUV.needsUpdate = true;
}

window.onload = init;