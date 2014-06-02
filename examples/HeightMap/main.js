var filters = [
	{
		name: "Contours",
		id: "contour",
		filter: new CLARITY.Contourer({enabled:false})
	},
	{
		name: "Median Threshold",
		id: "median",
		filter: new CLARITY.MedianThreshold({enabled:false})
	},
	{
		name: "Edge Detector",
		id: "edge",
		filter: new CLARITY.EdgeDetector({enabled:false})
	},
];

var ctx;
var ctxNorm;
var terrain;
var width;
var height;

var scene;
var camera;
var renderer;
var clock;

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
			render();
		}

		filters[i].position = i;
		filters[i].active = false;
	}

	ctx = document.getElementById('canvas').getContext('2d');
	ctxNorm = document.getElementById('normal').getContext('2d');
	width = canvas.width;
	height = canvas.height;

	//THREE.js stuff
	renderer = new THREE.WebGLRenderer({antialias:true, canvas: document.getElementById('three')});
	camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 100);
	scene = new THREE.Scene();
	light = new THREE.PointLight(0xFFFFFF, 1);
	clock = new THREE.Clock()
	clock.start();
	camera.add(light);
	scene.add(camera);
	camera.position.z = 60;
	renderer.setSize(width, height);
	renderer.setClearColor(0x000000, 0);

	render();
	terrain = loadTerrain(normFrame);
	scene.add(terrain);
	loop();
}

function compareFilters(first, second){
	return first.position > second.position;
}

function render(){
	var img = document.getElementById("image");
	
	ctx.drawImage(img, 0, 0, width, height);

	frame = ctx.getImageData(0,0,width,height);
	normFrame = new CLARITY.NormalGenerator().process(frame);
	// normFrame = new CLARITY.NormalIntensity({intensity:1}).process(normFrame);

	for(var i = 0; i < filters.length; i++){
		frame = filters[i].filter.process(frame);
	}

	// normFrame = new CLARITY.Smoother().process(normFrame);

	ctx.putImageData(frame, 0, 0);
	ctxNorm.putImageData(normFrame, 0, 0);
}

function loop(){
	requestAnimationFrame(loop);
	renderer.render(scene, camera);

	terrain.rotation.y += 0.01;
}

function loadTerrain(norm){
	var geo = new THREE.Geometry();
	var normals = [];

	var segs = 250;

	var ix, iz;
	var width_half = width/2;
	var height_half = height/2;

	var gridX = segs;
	var gridZ = segs;

	var gridX1 = segs+1;
	var gridZ1 = segs+1;

	var segment_width = width/gridX;
	var segment_height = height/gridZ;
	
	for(iz = 0; iz < gridZ1; iz ++){
		for(ix = 0; ix < gridX1; ix ++){
			var x = ix * segment_width - width_half;
			var z = iz * segment_height - height_half;
			var y = (z+height_half)*4*width + (x+width_half)*4;

			geo.vertices.push(new THREE.Vector3(x, frame.data[y]/2, z));
			var normal = new THREE.Vector3((norm.data[y]-128)/128, norm.data[y+2]/255, (norm.data[y+1]-128)/128);
			normal = normal.normalize();
			normals.push(normal);
		}
	}

	for(iz = 0; iz < gridZ; iz ++){
		for(ix = 0; ix < gridX; ix ++){
			var a = ix + gridX1 * iz;
			var b = ix + gridX1 * (iz + 1);
			var c = (ix + 1) + gridX1 * (iz + 1);
			var d = (ix + 1) + gridX1 * iz;

			var uva = new THREE.Vector2(ix / gridX, 1 - iz/gridZ);
			var uvb = new THREE.Vector2(ix / gridX, 1 - (iz + 1)/gridZ);
			var uvc = new THREE.Vector2((ix + 1)/gridX, 1 - (iz + 1)/gridZ);
			var uvd = new THREE.Vector2((ix + 1)/gridX, 1 - iz/gridZ);

			var y = (z*4)*width + (x*4);

			var face = new THREE.Face3( a, b, d );
			face.vertexNormals.push(normals[a].clone(), normals[b].clone(), normals[d].clone());

			geo.faces.push(face);
			geo.faceVertexUvs[0].push([uva, uvb, uvd]);

			face = new THREE.Face3(b, c, d);
			face.vertexNormals.push(normals[b].clone(), normals[c].clone(), normals[d].clone());

			geo.faces.push(face);
			geo.faceVertexUvs[0].push([uvb.clone(), uvc, uvd.clone()]);
		}
	}

	var mat = new THREE.MeshLambertMaterial({color: 0xFFFFFF});
	var terrain = new THREE.Mesh(geo, mat);
	terrain.rotation.x = Math.PI/4;
	terrain.scale.x = 0.1;
	terrain.scale.y = 0.1;
	terrain.scale.z = 0.1;
	return terrain;
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

window.onload = init;