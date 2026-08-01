var filters = [
	{
		name: "Average Thresholder",
		id: "avThresh",
		filter: new CLARITY.ValueThreshold({threshold:64, channel:'red', enabled:false})
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
		filter: new CLARITY.EdgeDetector({fast:true, enabled:false})
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

var clarity;

function init(){
	canvas = document.querySelector('#canvas');
	var target = document.querySelector('#canvas2');
	width = canvas.width;
	height = canvas.height;

	//The three.js canvas is the source: the Clarity renderer draws it into its
	//own scratch each frame and puts the filtered result on #canvas2. A canvas
	//source is live by default, which is right here - something else is drawing
	//into it every frame.
	clarity = new CLARITY.Renderer(target).source(canvas);
	filters.forEach(function(entry){
		clarity.add(entry.filter);
	});

	ClarityList.create({
		renderer: clarity,
		names: filters.map(function(entry){ return entry.name; }),
		list: document.getElementById('shuffle'),
		controls: document.getElementById('controls')
	});

	canvas.onclick = function(e){
		clarity.pipeline.filters.forEach(function(filter){
			if(typeof filter.setClick === 'function'){
				filter.setClick([e.offsetX, e.offsetY]);
			}
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
	reportStats();
}

//Still a hand-rolled loop, because the scene has to be animated and rendered
//before Clarity reads it. clarity.render() is the one-shot form; clarity.start()
//would own the loop instead, which is what the Image and Video examples do.
function render(){
	requestAnimationFrame(render);

	var pos = clock.getElapsedTime();
	spherer.position.y =  Math.sin(pos*2)*5;
	sphereg.position.y =  Math.cos(pos*2)*5;
	sphereb.position.y = -Math.sin(pos*2)*5;

	renderer.render(scene, camera);
	clarity.render();
}

function reportStats(){
	var readout = document.getElementById('stats');
	if(!readout) return;

	setInterval(function(){
		readout.textContent = 'last frame: ' + clarity.stats.total.toFixed(1) +
			'ms over ' + clarity.pipeline.length + ' stages';
	}, 500);
}

window.onload = init;
