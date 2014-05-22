
//FillRGB object
CLARITY.FillRGB = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || 128,
		green: options.green || 128,
		blue: options.blue || 128
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.FillRGB.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.FillRGB.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
        // color: Math.floor(Math.random()*16777215).toString(16)

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;

			outPut.data[i  ] = this.properties.red;
			outPut.data[i+1] = this.properties.green;
			outPut.data[i+2] = this.properties.blue;
			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.FillRGB.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet);
	
	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'red');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('red', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'green');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('green', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'blue');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('blue', e.srcElement.value);
	});

	return controls;
}
