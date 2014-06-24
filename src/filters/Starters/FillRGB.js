
//FillRGB object
CLARITY.FillRGB = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || 0,
		green: options.green || 0,
		blue: options.blue || 0
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.FillRGB.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.FillRGB.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);
        // color: Math.floor(Math.random()*16777215).toString(16)

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		output.data[i  ] = this.properties.red;
		output.data[i+1] = this.properties.green;
		output.data[i+2] = this.properties.blue;
		output.data[i+3] = 255;
	}

	return output;
};

CLARITY.FillRGB.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'red', this.properties.red);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('red', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'green', this.properties.green);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('green', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'blue', this.properties.blue);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('blue', e.srcElement.value);
	});

	return controls;
}
