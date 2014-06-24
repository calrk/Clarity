var texType = 'sandstone';

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
	
	material = new THREE.MeshPhongMaterial({color: 0xFFFFFF, shininess: 0})
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

var multiplier = new CLARITY.Multiply();
var blender = new CLARITY.Blend();
function updateTexture(){
	var img = document.getElementById('image');
	var ctx = canvasTex.getContext('2d');
	var frame;
	
	if(texType == 'sandstone'){
		frame = sandstone(ctx);
	}
	else if(texType == 'brick'){
		frame = brick(ctx);
	}

	ctx.putImageData(frame, 0, 0);

	var img = canvasTex.toDataURL('image/png');
	var imageTex = document.getElementById('imageTex');
	imageTex.src = img;
	texture.image = imageTex;
	texture.needsUpdate = true;

	var gdf = canvasTex.toDataURL('image/png');
	var asd = document.createElement('img');
	asd.src = gdf;
	document.body.appendChild(asd);
}


function updateNorm(){
	var img = document.getElementById('image');
	var ctx = canvasNorm.getContext('2d');

	// ctx.drawImage(canvasTex, 0, 0, width, height);
	var frame = ctx.getImageData(0,0,width,height);

	if(texType == 'sandstone' || texType == 'brick'){
		frame = new CLARITY.Brickulate({verticalSegs: 8, offset: true}).process(frame);
		frame = new CLARITY.Invert().process(frame);

		frame = new CLARITY.NormalGenerator({intensity: 0.15}).process(frame);
		frame = new CLARITY.NormalIntensity({intensity: 0.05}).process(frame);
		frame = new CLARITY.Noise({intensity:30, monochromatic: false}).process(frame);
		frame = new CLARITY.Smoother().process(frame);
	}

	ctx.putImageData(frame, 0, 0);

	var img = canvasNorm.toDataURL('image/png');
	var imageNorm = document.getElementById('imageNorm');
	imageNorm.src = img;
	textureNorm.image = imageNorm;
	textureNorm.needsUpdate = true;
}


function dirt(ctx){
	var frame1, frame2;
	frame1 = ctx.getImageData(0,0,width,height);
	frame2 = ctx.getImageData(0,0,width,height);

	var cloud = new CLARITY.Cloud({red: 255, green: 255, blue: 255}).process(frame1);
	frame2 = new CLARITY.FillRGB({red: 254, green: 164, blue: 96}).process(frame2);
	frame1 = multiplier.process([cloud, frame2]);

	cloud = new CLARITY.Invert({dynamic:true}).process(cloud);
	frame2 = new CLARITY.FillRGB({red: 139, green: 90, blue: 43}).process(frame2);
	frame2 = multiplier.process([cloud, frame2]);

	frame1 = blender.process([frame1, frame2]);
	frame1 = new CLARITY.hsvShifter({value:1.5}).process(frame1);

	return frame1;
}

function sandstone(ctx){
	var frame1, frame2;
	frame1 = ctx.getImageData(0,0,width,height);
	frame2 = ctx.getImageData(0,0,width,height);
	
	var cloud = new CLARITY.Cloud({red: 255, green: 255, blue: 255}).process(frame1);
	frame2 = new CLARITY.FillRGB({red: 208, green: 186, blue: 137}).process(frame2);
	frame1 = multiplier.process([cloud, frame2]);

	cloud = new CLARITY.Invert({dynamic:true}).process(cloud);
	frame2 = new CLARITY.FillRGB({red: 163, green: 133, blue: 87}).process(frame2);
	frame2 = multiplier.process([cloud, frame2]);

	frame1 = blender.process([frame1, frame2]);
	frame1 = new CLARITY.hsvShifter({value:3}).process(frame1);

	// frame1 = new CLARITY.Puzzler().process(frame1);

	return frame1;
}

function brick(ctx){
	var frame1, frame2;
	frame1 = ctx.getImageData(0,0,width,height);
	frame2 = ctx.getImageData(0,0,width,height);
	
	var cloud = new CLARITY.Cloud({red: 255, green: 255, blue: 255}).process(frame1);
	frame2 = new CLARITY.FillRGB({red: 88, green: 25, blue: 0}).process(frame2);
	frame1 = multiplier.process([cloud, frame2]);

	cloud = new CLARITY.Invert({dynamic:true}).process(cloud);
	frame2 = new CLARITY.FillRGB({red: 88, green: 0, blue: 0}).process(frame2);
	frame2 = multiplier.process([cloud, frame2]);
	frame2 = new CLARITY.hsvShifter({value:3}).process(frame2);

	frame1 = blender.process([frame1, frame2]);
	frame1 = new CLARITY.hsvShifter({value:2}).process(frame1);

	var mortarfill = new CLARITY.FillRGB({red: 208, green: 186, blue: 137}).process(frame2);
	mortar = new CLARITY.Brickulate({verticalSegs: 8, offset: true}).process(frame2);
	mortar = multiplier.process([mortarfill, mortar]);

	frame1 = new CLARITY.AddSub().process([frame1, mortar]);

	frame1 = new CLARITY.Puzzler().process(frame1);

	return frame1;
}

window.onload = init;
