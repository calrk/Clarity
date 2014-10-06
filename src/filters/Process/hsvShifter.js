//hsvShifter object
CLARITY.hsvShifter = function(options){
	var options = options || {};

	this.properties = {
		hue: options.hue || 0,
		saturation: options.saturation || 1,
		value: options.value || options.lightness || 1
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.hsvShifter.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.hsvShifter.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var col = CLARITY.Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
		
		col[0] += this.properties.hue;
		if(col[0] > 360){
			col[0] -= 360;
		}
		col[1] *= this.properties.saturation;
		col[2] *= this.properties.value;
		
		col = CLARITY.Operations.HSVtoRGB([col[0], col[1], col[2]]);
		
		output.data[i+0] = col[0];
		output.data[i+1] = col[1];
		output.data[i+2] = col[2];
		output.data[i+3] = frame.data[i+3];
	}

	return output;
};

CLARITY.hsvShifter.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 360, 1, 'hue', this.properties.hue);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('hue', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'saturation', this.properties.saturation);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('saturation', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 2, 0.1, 'lightness', this.properties.lightness);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('value', e.srcElement.value);
	});

	return controls;
}
