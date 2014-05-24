//Value Threshold object
CLARITY.ValueThreshold = function(options){
	var options = options || {};

	this.properties = {
		inverted: options.inverted || false,
		thresh: options.thresh || null		
	}
	
	CLARITY.Filter.call( this, options );
};

CLARITY.ValueThreshold.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.ValueThreshold.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	//gets the threshold value
	var threshold = this.properties.thresh || this.getThresholdValue(frame);
	//performs the thresholding on the data
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var colour = this.getColourValue(frame, i, this.channel);
		if(this.properties.inverted){
			if(colour < threshold){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}
		}
		else{
			if(colour > threshold){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//used to get an iterative average threshold value
CLARITY.ValueThreshold.prototype.getThresholdValue = function(data){
	var average;
	average = this.getColourValue(data, 0);
	//finds the intial average of all the data
	for(var i = 4; i < data.width*data.height*4; i+=4){
		var colour = this.getColourValue(data, i);
		average = (average+colour)/2;
	}

	var lower = 0;
	var upper = 0;
	var previous = 0;
	var current = average;
	//checks to see if the new average is near the old average
	while(!(previous > current - 1 && previous < current + 1)){
		previous = current;
		//splits the data up depending on the current threshold, and finds an average of each
		for(var i = 0; i < data.width*data.height*4; i+=4){
			var colour = this.getColourValue(data, i);
			if(colour < previous){
				if(lower == 0){
					lower = colour;
				}
				else{
					lower = (lower + colour)/2;
				}
			}
			else{
				if(upper == 0){
					upper = colour;
				}
				else{
					upper = (upper + colour)/2;
				}
			}
		}
		//averages the two averages
		current = (upper+lower)/2;
		lower = 0;
		upper = 0;
	}
	return current;
}

CLARITY.ValueThreshold.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet);
	controls.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.toggleEnabled();
	});
	
	var toggle = CLARITY.Interface.createToggle(this.properties.inverted, 'Inverted');
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('inverted');
	});

	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'Threshold');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('thresh', e.srcElement.value);
	});

	return controls;
}