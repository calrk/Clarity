//Smoother object
CLARITY.Smoother = function(options){
	var options = options || {};
	// this.distance = options.distance || 1;
	this.iterations = options.iterations || 1;
	this.properties = {
		iterations: options.iterations || 1
	};

	CLARITY.Filter.call( this, options );
}

CLARITY.Smoother.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Smoother.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var z = 0; z < this.properties.iterations; z++){
		for(var y = 1; y < frame.height - 1; y++){
			for(var x = 1; x < frame.width - 1; x++){
				var i = (y*frame.width + x)*4;
				
				var up = ((y-1)*frame.width + x)*4;
				var down = ((y+1)*frame.width + x)*4;
				var left = (y*frame.width + (x-1))*4;
				var right = (y*frame.width + (x+1))*4;
				
				outPut.data[i+0] = (frame.data[left+0] + frame.data[right+0] + frame.data[up+0] + frame.data[down+0])/4;
				outPut.data[i+1] = (frame.data[left+1] + frame.data[right+1] + frame.data[up+1] + frame.data[down+1])/4;
				outPut.data[i+2] = (frame.data[left+2] + frame.data[right+2] + frame.data[up+2] + frame.data[down+2])/4;
				outPut.data[i+3] = 255;
			}
		}
	}

	return outPut;
};

CLARITY.Smoother.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet);
	
	var slider = CLARITY.Interface.createSlider(1, 5, 1, 'iterations');
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('iterations', e.srcElement.value);
	});

	return controls;
}
