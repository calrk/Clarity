//Noise object
CLARITY.Noise = function(options){
	var options = options || {};

	this.properties = {
		intensity: options.intensity || 1,
		monochromatic: options.monochromatic || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Noise.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Noise.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		if(this.properties.monochromatic){
			var random = 2*(Math.random()-0.5)*this.properties.intensity;
			// var col = CLARITY.Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
			// col[2] += CLARITY.Operations.clamp((Math.random()-0.5)*2, 0, 1);
			// col = CLARITY.Operations.HSVtoRGB([col[0], col[1], col[2]]);
			outPut.data[i  ] = frame.data[i  ] + random;
			outPut.data[i+1] = frame.data[i+1] + random;
			outPut.data[i+2] = frame.data[i+2] + random;
		}
		else{
			outPut.data[i  ] = frame.data[i  ] + 2*(Math.random()-0.5)*this.properties.intensity;
			outPut.data[i+1] = frame.data[i+1] + 2*(Math.random()-0.5)*this.properties.intensity;
			outPut.data[i+2] = frame.data[i+2] + 2*(Math.random()-0.5)*this.properties.intensity;
		}
		
		outPut.data[i+3] = 255;
	}

	return outPut;
};

CLARITY.Noise.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 10, 0.1, 'intensity', this.properties.intensity);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
	});

	var toggle = CLARITY.Interface.createToggle('monochromatic', this.properties.monochromatic);
	controls.appendChild(toggle);
	toggle.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.toggleBool('monochromatic');
	});

	return controls;
}
