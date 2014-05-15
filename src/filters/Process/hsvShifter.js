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

CLARITY.hsvShifter.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var col = CLARITY.Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
		
		col[0] += this.properties.hue;
		if(col[0] > 360){
			col[0] -= 360;
		}
		col[1] *= this.properties.saturation;
		col[2] *= this.properties.value;
		
		col = CLARITY.Operations.HSVtoRGB([col[0], col[1], col[2]]);
		
		outPut.data[i+0] = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.hsvShifter.prototype.createControls = function(){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup();
	
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
	
	document.getElementById('controls').appendChild(controls);
}
