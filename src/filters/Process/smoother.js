//Smoother object
CLARITY.Smoother = function(options){
	var options = options || {};
	// this.distance = options.distance || 1;
	this.properties = {
		iterations: options.iterations || 1
	};

	CLARITY.Filter.call( this, options );
}

CLARITY.Smoother.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Smoother.prototype.doProcess = function(frame){
	//each pass now reads the previous pass's output. Before, every iteration read
	//`frame` and wrote the same buffer, so iterations > 1 recomputed an identical
	//result and the control did nothing.
	var source = frame;
	var output = frame;

	for(var z = 0; z < this.properties.iterations; z++){
		output = CLARITY.ctx.createImageData(frame.width, frame.height);

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
					col[0] += source.data[left];
					col[1] += source.data[left+1];
					col[2] += source.data[left+2];
					count ++;
				}
				if(x != frame.width-1){
					col[0] += source.data[right];
					col[1] += source.data[right+1];
					col[2] += source.data[right+2];
					count ++;
				}
				if(y != 0){
					col[0] += source.data[up];
					col[1] += source.data[up+1];
					col[2] += source.data[up+2];
					count ++;
				}
				if(y != frame.height-1){
					col[0] += source.data[down];
					col[1] += source.data[down+1];
					col[2] += source.data[down+2];
					count ++;
				}

				output.data[i  ] = col[0]/count;
				output.data[i+1] = col[1]/count;
				output.data[i+2] = col[2]/count;
				output.data[i+3] = 255;
			}
		}

		source = output;
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
