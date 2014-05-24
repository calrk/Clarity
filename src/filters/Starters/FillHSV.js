
//FillHSV object
CLARITY.FillHSV = function(options){
	var options = options || {}
	this.properties = {
		hue: options.hue || 0,
		saturation: options.saturation || 0,
		value: options.value || options.lightness || 0
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.FillHSV.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.FillHSV.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var col = CLARITY.Operations.HSVtoRGB(this.properties.hue, this.properties.saturation, this.properties.value);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		outPut.data[i  ] = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.FillHSV.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet);
	
	var slider = CLARITY.Interface.createSlider(0, 360, 1, 'hue');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('hue', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'saturation');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('saturation', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'lightness');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('value', e.srcElement.value);
	});

	return controls;
}
