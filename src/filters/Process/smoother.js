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

CLARITY.Smoother.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var z = 0; z < this.properties.iterations; z++){
		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*4;

				var up = ((y-1)*frame.width + x)*4;
				var down = ((y+1)*frame.width + x)*4;
				var left = (y*frame.width + (x-1))*4;
				var right = (y*frame.width + (x+1))*4;

				var count = 0;
				var col = [0, 0, 0];

				if(x != 0){
					col[0] += frame.data[left];
					col[1] += frame.data[left+1];
					col[2] += frame.data[left+2];
					count ++;
				}
				if(x != frame.width-1){
					col[0] += frame.data[right];
					col[1] += frame.data[right+1];
					col[2] += frame.data[right+2];
					count ++;
				}
				if(y != 0){
					col[0] += frame.data[up];
					col[1] += frame.data[up+1];
					col[2] += frame.data[up+2];
					count ++;
				}
				if(y != frame.height-1){
					col[0] += frame.data[down];
					col[1] += frame.data[down+1];
					col[2] += frame.data[down+2];
					count ++;
				}

				output.data[i  ] = col[0]/count;
				output.data[i+1] = col[1]/count;
				output.data[i+2] = col[2]/count;
				output.data[i+3] = 255;
			}
		}
	}

	return output;
};

CLARITY.Smoother.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 5, 1, 'iterations', this.properties.iterations);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('iterations', e.srcElement.value);
	});

	return controls;
}
