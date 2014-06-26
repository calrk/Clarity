//Channel Separate
//Translates the image by the percentages specified
CLARITY.ChannelSeparate = function(options){
	var options = options || {};

	this.properties = {
		distance: options.distance || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.ChannelSeparate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.ChannelSeparate.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);
	var xTranslate = this.properties.distance;

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var from = (y*frame.width + x)*4;
			var fromR = (y*frame.width + (x+xTranslate))*4
			var fromG = (y*frame.width + (x-xTranslate))*4
			if(fromR < 0 || fromG < 0){
				continue;
			}
			
			output.data[from]   = frame.data[fromR];
			output.data[from+1] = frame.data[fromG+1];
			output.data[from+2] = frame.data[from+2];

			output.data[from+3] = 255;
		}
	}

	return output;
};

CLARITY.ChannelSeparate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 200, 1, 'distance', this.properties.distance);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('distance', e.srcElement.value);
	});

	return controls;
}
