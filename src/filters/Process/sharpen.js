//Sharpen object
CLARITY.Sharpen = function(options){
	var options = options || {};

	this.properties = {
		intensity: options.intensity || 1
	};

	this.makeKernel(this.properties.intensity);

	CLARITY.Filter.call( this, options );
};

CLARITY.Sharpen.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Sharpen.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	// for(var y = frame.height*4-4; y > 4; y -= 4){
		// for(var x = frame.width*4-4; x > 4; x -= 4){
	for(var y = 4; y < frame.height*4-4; y+=4){
		for(var x = 4; x < frame.width*4-4; x+=4){
			var sumr = 0;
			var sumg = 0;
			var sumb = 0;
			for(var ky = -1; ky <= 1; ky++){
				for(var kx = -1; kx <= 1; kx++){
					var pos = (y + ky*4)*frame.width + (x + kx*4);
					
					var valr = this.getColourValue(frame, pos, 'red');
					var valg = this.getColourValue(frame, pos, 'green');
					var valb = this.getColourValue(frame, pos, 'blue');

					sumr += this.kernel[ky+1][kx+1] * valr;
					sumg += this.kernel[ky+1][kx+1] * valg;
					sumb += this.kernel[ky+1][kx+1] * valb;
				}
			}
			output.data[y*frame.width + x]   = sumr;
			output.data[y*frame.width + x+1] = sumg;
			output.data[y*frame.width + x+2] = sumb;
			output.data[y*frame.width + x+3] = 255;
		}
	}

	return output;
};

CLARITY.Sharpen.prototype.makeKernel = function(intensity){
	this.kernel = [ [ -intensity, -intensity, -intensity],
				    [ -intensity,  8*intensity+1, -intensity],
				    [ -intensity, -intensity, -intensity]];
}

CLARITY.Sharpen.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 3, 0.1, 'Intensity', this.properties.intensity);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('intensity', e.srcElement.value);
		self.makeKernel(self.properties.intensity);
	});

	return controls;
}
