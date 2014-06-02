var texFilters = [
	{
		name: "Fill RGB",
		filter: new CLARITY.FillRGB({red: 128, green:0, blue:0})
	},
	{
		name: "Fill HSV",
		filter: new CLARITY.FillHSV({hue: 128, saturation:1, lightness:1, enabled:false})
	},
	{
		name: "Fill Cloud",
		filter: new CLARITY.Cloud({red: 255, enabled:false})
	},
	/*{
		name: "Translator",
		filter: new CLARITY.Translator({horizontal: 0.5})
	},*/
	{
		name: "Pixelate",
		filter: new CLARITY.Pixelate({enabled:false})
	},
	{
		name: "Add Noise",
		filter: new CLARITY.Noise({intensity:50, monochromatic: false, enabled:false})
	},
	{
		name: "Smooth",
		filter: new CLARITY.Smoother({enabled:false})
	},
]
var normalFilters = [
	{
		name: "Fill Solid",
		filter: new CLARITY.FillRGB({red: 128, green:128, blue:255, enabled:false})
	},
	{
		name: "Generate from Texture",
		filter: new CLARITY.NormalGenerator({enabled: true})
	},
	{
		name: "Swap Angles",
		filter: new CLARITY.NormalFlip({enabled:false})
	},
	{
		name: "Add Noise",
		filter: new CLARITY.Noise({intensity:50, monochromatic: false, enabled:false})
	},
	{
		name: "Modify Intensity",
		filter: new CLARITY.NormalIntensity({intensity: 0.25, enabled:false})
	},
	{
		name: "Smooth",
		filter: new CLARITY.Smoother({enabled:false})
	},
]

var canvas;
var canvasTex;
var canvasUV;
var width;
var height;

var scene;
var camera;
var renderer;

var texture;
var sphere;
var cube;
var material;
var needsUpdate = true;

function init(){
	canvas = document.querySelector('#canvas');
	canvasTex = document.querySelector('#canvasTex');
	canvasUV = document.querySelector('#canvasUV');

	for(var i = 0; i < texFilters.length; i++){
		var controls = texFilters[i].filter.createControls(texFilters[i].name);
		document.getElementById('controlsTex').appendChild(controls);

		controls.addEventListener('click', function(){
			needsUpdate = true;
		});
	}

	for(var i = 0; i < normalFilters.length; i++){
		var controls = normalFilters[i].filter.createControls(normalFilters[i].name);
		document.getElementById('controlsNorm').appendChild(controls);

		controls.addEventListener('click', function(){
			needsUpdate = true;
		});
	}

	width = 512;
	height = 512;

	//THREE.js stuff
	renderer = new THREE.WebGLRenderer({antialias:true, canvas: canvas});
	camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 100);
	scene = new THREE.Scene();
	light = new THREE.PointLight(0xFFFFFF, 1);
	camera.add(light);
	scene.add(camera);
	camera.position.z = 20;
	renderer.setSize(width, height);
	renderer.setClearColor(0x999999, 0);

	texture = new THREE.Texture();
	textureNorm = new THREE.Texture();
	
	material = new THREE.MeshPhongMaterial({color: 0xFFFFFF})
	material.map = texture;
	material.normalMap = textureNorm;

	sphere = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), material);
	sphere.position.x = -6;
	scene.add(sphere);

	cube = new THREE.Mesh(new THREE.CubeGeometry(8, 8, 8), material);
	cube.position.x = 6;
	scene.add(cube);

	render();
}

function slide(elem, field){
	var val = elem.value;
	if(field == 'shininess'){
		material.shininess = val;
	}
	else{
		material.specular[field[0]] = val;
	}
}

function render(){
	requestAnimationFrame(render);

	renderer.render(scene, camera);

	sphere.rotation.y += 0.01;
	cube.rotation.y   += 0.01;

	if(needsUpdate){
		needsUpdate = false;
		updateTexture();
		updateNorm();
	}
}

function updateTexture(){
	var img = document.getElementById("image");
	var ctx = canvasTex.getContext('2d');

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

function updateNorm(){
	var img = document.getElementById("image");
	var ctx = canvasNorm.getContext('2d');

	ctx.drawImage(canvasTex, 0, 0, width, height);
	var frame = ctx.getImageData(0,0,width,height);

	for(var i = 0; i < normalFilters.length; i++){
		frame = normalFilters[i].filter.process(frame);
	}

	ctx.putImageData(frame, 0, 0);

	var img = canvasNorm.toDataURL("image/png");
	var imageNorm = document.getElementById("imageNorm");
	imageNorm.src = img;
	textureNorm.image = imageNorm;
	textureNorm.needsUpdate = true;
}

window.onload = init;