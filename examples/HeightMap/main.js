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

var normalFilters = [
	{
		name: "Generate from Texture",
		filter: new CLARITY.NormalGenerator({enabled: true})
	},
	{
		name: "Swap Angles",
		filter: new CLARITY.NormalFlip({enabled:true, red:true})
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
		name: "Blur",
		filter: new CLARITY.Blur({enabled:false})
	},
]

var ctx;
var canvasNorm;
var ctxNorm;
var terrain;
var width;
var height;

var scene;
var camera;
var renderer;
var clock;

//Two chains: the one you see on the left, and the one that turns the same
//source into a normal map for the three.js material. Each is a Pipeline, so the
//ordering and the caching are handled rather than being two more for-loops.
var visiblePipeline = new CLARITY.Pipeline();
var normalPipeline = new CLARITY.Pipeline();

function init(){
	filters.forEach(function(entry){ visiblePipeline.add(entry.filter); });
	normalFilters.forEach(function(entry){ normalPipeline.add(entry.filter); });

	buildList(visiblePipeline, filters, document.getElementById('shuffle'));

	for(var i = 0; i < normalFilters.length; i++){
		var controls = ClarityControls.createControls(normalFilters[i].filter, normalFilters[i].name);
		document.getElementById('controlsNorm').appendChild(controls);

		controls.addEventListener('click', function(){
			render();
			// needsUpdate = true;
		});
	}

	ctx = document.getElementById('canvas').getContext('2d');
	canvasNorm = document.getElementById('normal');
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

	//dodgy toggling things for this example
	normalFilters[1].filter.toggleEnabled();
	normalFilters[1].filter.toggleProperty('red');

	textureNorm = new THREE.Texture();
	render();
	terrain = loadTerrain(normFrame);
	scene.add(terrain);
	loop();
	
	//dodgy toggling things for this example
	normalFilters[0].filter.setProperty('intensity', 0.1);
	normalFilters[1].filter.toggleEnabled();
	normalFilters[1].filter.toggleProperty('red');
	render();
}

//Kept as a hand-rolled render rather than a Renderer, because it drives two
//chains into two canvases and has to push the second into a three.js texture
//afterwards. The chains themselves are Pipelines.
function render(){
	var img = document.getElementById("image");
	
	ctx.drawImage(img, 0, 0, width, height);

	frame = ctx.getImageData(0,0,width,height);
	normFrame = ctx.getImageData(0,0,width,height);
	// normFrame = new CLARITY.NormalIntensity({intensity:1}).process(normFrame);

	frame = visiblePipeline.run(frame);
	normFrame = normalPipeline.run(normFrame);

	// normFrame = new CLARITY.Smoother().process(normFrame);

	ctx.putImageData(frame, 0, 0);
	ctxNorm.putImageData(normFrame, 0, 0);


	var img = canvasNorm.toDataURL("image/png");
	var imageNorm = document.getElementById("imageNorm");
	imageNorm.src = img;
	textureNorm.image = imageNorm;
	textureNorm.needsUpdate = true;
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
			// geo.vertices.push(new THREE.Vector3(x, 0, z));
			// var normal = new THREE.Vector3(0,0,1);
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

	var mat = new THREE.MeshPhongMaterial({color: 0xFFFFFF, normalMap: textureNorm});
	var terrain = new THREE.Mesh(geo, mat);
	terrain.rotation.x = Math.PI/4;
	terrain.scale.x = 0.1;
	terrain.scale.y = 0.1;
	terrain.scale.z = 0.1;
	return terrain;
}

//This example needs a re-render after every list change rather than running a
//loop, so it wires the list itself rather than using ClarityList. The old
//`shuffleChanged` that matched <li> ids back to a `position` field, plus the
//two identical copies of `compareFilters` this file had accumulated, are gone -
//the Pipeline owns the order.
function buildList(pipeline, entries, list){
	entries.forEach(function(entry, index){
		var item = document.createElement('li');
		item.className = entry.filter.enabled ? 'listGreen' : 'listRed';
		item.textContent = entry.name;

		item.onclick = function(){
			var filter = pipeline.at(Array.prototype.indexOf.call(list.children, item));
			filter.enabled = !filter.enabled;
			item.className = filter.enabled ? 'listGreen' : 'listRed';
			render();
		};

		list.appendChild(item);
		void index;
	});

	var startedAt = -1;
	$(list)
		.sortable({
			start: function(event, ui){ startedAt = ui.item.index(); },
			update: function(event, ui){
				pipeline.move(startedAt, ui.item.index());
				render();
			}
		})
		.disableSelection();
}

window.onload = init;