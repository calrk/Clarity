//Wave
//Translates the image by the percentages specified
CLARITY.Wave = function(options){
	var options = options || {};

	this.properties = {
		horizontal: options.horizontal || false,
		vertical: options.vertical || false,
		speed: options.speed === undefined ? 1 : Math.round(options.speed),
		frequency: options.frequency || 10,
		amplitude: options.amplitude || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Wave.prototype = Object.create( CLARITY.Filter.prototype );

//Rewritten as a gather (each output pixel reads its own source) rather than a scatter.
//The old version wrote to a computed destination, so wherever the mapping wasn't onto
//it left un-written holes - visible as tearing. A gather writes every output pixel
//exactly once, needs no second buffer for the two-axis case, and is the form a
//fragment shader would take.
CLARITY.Wave.prototype.doProcess = function(frame){
	var horizontal = this.properties.horizontal;
	var vertical = this.properties.vertical;

	if(!horizontal && !vertical){
		return frame;
	}

	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	//performance.now() climbs monotonically. The old Date().getMilliseconds()
	//wrapped at 1000ms, so the phase snapped back once every second.
	var phase = ((performance.now()/1000)*Math.PI*2)*this.properties.speed;

	//hoisted out of the inner loop - each is a function of one axis only
	var xOffsets = [];
	if(horizontal){
		for(var y = 0; y < frame.height; y++){
			xOffsets[y] = Math.floor(this.waveFunction(y/this.properties.frequency+phase)*this.properties.amplitude);
		}
	}
	var yOffsets = [];
	if(vertical){
		for(var x = 0; x < frame.width; x++){
			yOffsets[x] = Math.floor(this.waveFunction(x/this.properties.frequency+phase)*this.properties.amplitude);
		}
	}

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var to = (y*frame.width + x)*4;

			//vertical first, then horizontal reads from the displaced row -
			//matches the order the old two-pass version applied them in
			var fromY = vertical ? y - yOffsets[x] : y;
			fromY = ((fromY % frame.height) + frame.height) % frame.height;

			var fromX = horizontal ? x - xOffsets[fromY] : x;
			fromX = ((fromX % frame.width) + frame.width) % frame.width;

			var from = (fromY*frame.width + fromX)*4;

			output.data[to  ] = frame.data[from  ];
			output.data[to+1] = frame.data[from+1];
			output.data[to+2] = frame.data[from+2];
			output.data[to+3] = 255;
		}
	}

	return output;
};

CLARITY.Wave.prototype.waveFunction = function(val){
	return Math.sin(val) + Math.sin(2*val);
}

CLARITY.Wave.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(-10, 10, 1, 'speed', this.properties.speed);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('speed', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(1, 100, 1, 'frequency', this.properties.frequency);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('frequency', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(1, 100, 1, 'amplitude', this.properties.amplitude);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('amplitude', e.srcElement.value);
	});

	var toggle = CLARITY.Interface.createToggle('Horizontal', this.properties.horizontal);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('horizontal');
	});

	toggle = CLARITY.Interface.createToggle('vertical', this.properties.vertical);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('vertical');
	});

	return controls;
}
