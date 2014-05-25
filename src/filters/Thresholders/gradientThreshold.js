
//Gradient Threshold object
CLARITY.GradientThreshold = function(options){
	var options = options || {};

	this.properties = {
		threshold: options.threshold || 20,
		distance: options.distance || 1
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.GradientThreshold.prototype = Object.create( CLARITY.Filter.prototype );

//The main function to do all the thresholding from
CLARITY.GradientThreshold.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var found = false;
	for(var y = this.properties.distance; y < frame.height - this.properties.distance; y++){
		for(var x = this.properties.distance; x < frame.width - this.properties.distance; x++){
			found = false;
			var i = (y*frame.width + x)*4;
			var up = ((y-this.properties.distance)*frame.width + x)*4;
			var down = ((y+this.properties.distance)*frame.width + x)*4;
			var left = (y*frame.width + (x-this.properties.distance))*4;
			var right = (y*frame.width + (x+this.properties.distance))*4;
			
			if(frame.data[i] < frame.data[left] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[left] + this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] < frame.data[right] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[right] + this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] < frame.data[up] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[up] + this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] < frame.data[down] - this.properties.threshold){
				found = true;
			}
			else if(frame.data[i] > frame.data[down] + this.properties.threshold){
				found = true;
			}
			if(found){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
				outPut.data[i+3] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
				outPut.data[i+3] = 255;	
			}
			
		}
	}
	return outPut;
};

CLARITY.GradientThreshold.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 100, 1, 'Threshold', this.properties.threshold);
	controls.appendChild(slider);
		slider.addEventListener('change', function(e){
		self.setFloat('threshold', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 10, 1, 'Distance', this.properties.distance);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('distance', e.srcElement.value);
	});

	return controls;
}
