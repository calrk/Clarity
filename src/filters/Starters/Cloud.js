
//Cloud object
CLARITY.Cloud = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || 0,
		green: options.green || 0,
		blue: options.blue || 0,
		linear: options.linear || false,
		iterations: options.iterations || 4,
		initialSize: options.initialSize || 4
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Cloud.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Cloud.prototype.doProcess = function(frame){
	var size = this.properties.initialSize;
	var iterations = 0;

	var data = [];
	for(var i = 0; i < frame.height*frame.width*3; i++){
		data[i] = 0;
	}
	for(var z = 0; z < this.properties.iterations; z++){
		size *= (z+1);
		if(size > frame.width){
			break;
		}
		iterations ++;

		var values = [];
		for(var i = 0; i < size; i++){
			values[i] = [];
			for(var j = 0; j < size; j++){
				values[i][j] = Math.round(Math.random()*255);
			}
		}

		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*3;

				var xpercent = (x%(frame.width/size))/(frame.width/size);
				var ypercent = (y%(frame.height/size))/(frame.height/size);
				var x1 = Math.floor(x/frame.width*size);
				var x2 = Math.ceil(x/frame.width*size);
				if(x2 >= size){
					x2 = 0;
				}

				var y1 = Math.floor(y/frame.height*size);
				var y2 = Math.ceil(y/frame.height*size);
				if(y2 >= size){
					y2 = 0;
				}

				var xval1; //interpolate in x(top) first
				var xval2; //interpolate in x(bottom) second
				var yval2; //interpolate between x(top) and x(bottom) using y

				if(!this.properties.linear){
					xpercent = this.smoothStep(xpercent);
					ypercent = this.smoothStep(ypercent);
				}
				
				xval1 = this.linearInterpolate(values[y1][x1], values[y1][x2], xpercent);
				xval2 = this.linearInterpolate(values[y2][x1], values[y2][x2], xpercent);
				yval2 = this.linearInterpolate(xval1, xval2, ypercent);

				data[i  ] += yval2/(z+1);
				data[i+1] += yval2/(z+1);
				data[i+2] += yval2/(z+1);
			}
		}
	}

	var output = CLARITY.ctx.createImageData(frame.width, frame.height);
	for(var k = 0; k < data.length; k ++){
		var i = k * 3;
		var j = k * 4;
		output.data[j  ] = data[i  ]/iterations * this.properties.red/255;
		output.data[j+1] = data[i+1]/iterations * this.properties.green/255;
		output.data[j+2] = data[i+2]/iterations * this.properties.blue/255;
		output.data[j+3] = 255;
	}
	return output;
};

CLARITY.Cloud.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 255, 1, 'red', this.properties.red);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('red', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'green', this.properties.green);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('green', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 255, 1, 'blue', this.properties.blue);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('blue', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 10, 1, 'iterations', this.properties.iterations);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('iterations', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 16, 1, 'Initial Size', this.properties.initialSize);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('initialSize', e.srcElement.value);
	});

	var toggle = CLARITY.Interface.createToggle('linear', this.properties.linear);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('linear');
	});

	return controls;
}

CLARITY.Cloud.prototype.linearInterpolate = function(min, max, x){
	return min+(max-min)*x;
}

CLARITY.Cloud.prototype.smoothStep = function(x){
	return x*x*(3 - 2*x);
}

CLARITY.Cloud.prototype.smootherStep = function(x){
	return x*x*x*(x*(x*6 - 15) + 10);
}
