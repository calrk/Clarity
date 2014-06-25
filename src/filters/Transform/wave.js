//Wave
//Translates the image by the percentages specified
CLARITY.Wave = function(options){
	var options = options || {};

	this.properties = {
		isHorizontal: true,
		speed: Math.round(options.speed) || 1,
		frequency: options.frequency || 10,
		amplitude: options.amplitude || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Wave.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Wave.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	var offset = ((new Date().getMilliseconds()/1000)*Math.PI*2)*this.properties.speed;

	if(this.properties.isHorizontal){
		for(var y = 0; y < frame.height; y++){
			var offsetx = Math.floor(this.waveFunction(y/this.properties.frequency+offset)*this.properties.amplitude);
			for(var x = 0; x < frame.width; x++){
				// var offsety = Math.floor(this.waveFunction(x/this.properties.frequency+offset)*this.properties.amplitude);
				var from = (y*frame.width + x)*4;
				var toX = x + offsetx;
				var toY = y;
				if(toX >= frame.width){
					toX -= frame.width;
				}
				else if(toX < 0){
					toX += frame.width;
				}
				if(toY >= frame.height){
					toY -= frame.height;
				}
				else if(toY < 0){
					toY += frame.height;
				}
				var to = ((toY)*frame.width + toX)*4;
				
				output.data[to] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];

				output.data[to+3] = 255;
			}
		}
	}
	else{
		for(var x = 0; x < frame.width; x++){
			var offsety = Math.floor(this.waveFunction(x/this.properties.frequency+offset)*this.properties.amplitude);
			for(var y = 0; y < frame.height; y++){
				var from = (y*frame.width + x)*4;
				var toX = x;
				var toY = y + offsety;
				if(toX >= frame.width){
					toX -= frame.width;
				}
				else if(toX < 0){
					toX += frame.width;
				}
				if(toY >= frame.height){
					toY -= frame.height;
				}
				else if(toY < 0){
					toY += frame.height;
				}
				var to = ((toY)*frame.width + toX)*4;
				
				output.data[to] = frame.data[from];
				output.data[to+1] = frame.data[from+1];
				output.data[to+2] = frame.data[from+2];

				output.data[to+3] = 255;
			}
		}
	}

	return output;
};

CLARITY.Wave.prototype.waveFunction = function(val){
	return Math.sin(val);
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

	var toggle = CLARITY.Interface.createToggle('Horizontal', this.properties.isHorizontal);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('isHorizontal');
	});

	return controls;
}
