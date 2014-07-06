//Channel Separate
//Translates the image by the percentages specified
CLARITY.ChannelSeparate = function(options){
	var options = options || {};

	this.properties = {
		xdistance: options.xdistance || 0,
		ydistance: options.ydistance || 0,
		fixed: options.fixed || false,
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.ChannelSeparate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.ChannelSeparate.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);
	var xTranslate = this.properties.xdistance;
	var yTranslate = this.properties.ydistance;

	if(this.properties.fixed){
		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var from = (y*frame.width + x)*4;
				var toR = ((y+yTranslate)*frame.width + (x+xTranslate))*4
				var toG = ((y-yTranslate)*frame.width + (x-xTranslate))*4
				
				output.data[from+3] = 255;
				
				if(toR < 0){
					output.data[toG+1]  = frame.data[from+1];
					output.data[from+2] = frame.data[from+2];
					continue;
				}
				else if(toG < 0){
					output.data[toR]    = frame.data[from];
					output.data[from+2] = frame.data[from+2];
				}
				
				output.data[toR]    = frame.data[from];
				output.data[toG+1]  = frame.data[from+1];
				output.data[from+2] = frame.data[from+2];
			}
		}
	}
	else{
		var yPercent, xPercent;
		for(var y = 0; y < frame.height; y++){
			yPercent = Math.round((1-Math.abs(y/frame.height-0.5)*2)*yTranslate);
			for(var x = 0; x < frame.width; x++){
				xPercent = Math.round((1-Math.abs(x/frame.width-0.5)*2)*xTranslate);
				var from = (y*frame.width + x)*4;
				var toR = ((y+yPercent)*frame.width + (x+xPercent))*4
				var toG = ((y-yPercent)*frame.width + (x-xPercent))*4
				
				output.data[from+3] = 255;
				
				if(toR < 0){
					output.data[toG+1]  = frame.data[from+1];
					output.data[from+2] = frame.data[from+2];
					continue;
				}
				else if(toG < 0){
					output.data[toR]    = frame.data[from];
					output.data[from+2] = frame.data[from+2];
				}
				
				output.data[toR]    = frame.data[from];
				output.data[toG+1]  = frame.data[from+1];
				output.data[from+2] = frame.data[from+2];
			}
		}

		//fix horizontal lines
		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*4;
				var up = ((y-1)*frame.width + x)*4;
				var down = ((y+1)*frame.width + x)*4;
				var left = (y*frame.width + (x-1))*4;
				var right = (y*frame.width + (x+1))*4;

				if(output.data[i] == 0){
					output.data[i] = (output.data[up] + output.data[down])/2;
				}
				if(output.data[i+1] == 0){
					output.data[i+1] = (output.data[up+1] + output.data[down+1])/2;
				}
			}
		}

		//fix vertical lines
		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*4;
				var left = (y*frame.width + (x-1))*4;
				var right = (y*frame.width + (x+1))*4;

				if(output.data[i] == 0){
					output.data[i] = (output.data[left] + output.data[right])/2;
				}
				if(output.data[i+1] == 0){
					output.data[i+1] = (output.data[left+1] + output.data[right+1])/2;
				}
			}
		}
	}

	return output;
};

CLARITY.ChannelSeparate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();

	var toggle = CLARITY.Interface.createToggle('fixed', this.properties.fixed);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('fixed');
	});
		
	var slider = CLARITY.Interface.createSlider(-100, 100, 1, 'xdistance', this.properties.xdistance);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('xdistance', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(-100, 100, 1, 'ydistance', this.properties.ydistance);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('ydistance', e.srcElement.value);
	});

	return controls;
}
