//LIFX object
CLARITY.LIFX = function(options){
	var options = options || {};

	this.properties = {
		showField: false
	};

	this.currentRGB = {
		r:0,
		g:0,
		b:0,
	}

	CLARITY.Filter.call( this, options );
};

CLARITY.LIFX.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.LIFX.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	var averageCount = 0;
	var averageU = 0;
	var averageV = 0;

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var i = (y*frame.width + x)*4;

			var u = (x-2)/frame.width-0.5;
			var v = (y-2)/frame.height-0.5;

			if(this.properties.showField){
				var rgb = CLARITY.Operations.YUVtoRGB({y:0.5, u:u, v:-v});
				output.data[i  ] = rgb.r*255;
				output.data[i+1] = rgb.g*255;
				output.data[i+2] = rgb.b*255;
			}
			else if(frame.data[i] > 128){
				//its a hit
				averageU += u;
				averageV += v;
				averageCount++;
			}

			output.data[i+3] = 255;
		}
	}
	if(averageCount == 0 || this.properties.showField){
		return output;
	}

	averageU = CLARITY.Operations.clamp(averageU/averageCount*1.5, -0.5, 0.5);
	averageV = CLARITY.Operations.clamp(averageV/averageCount*1.5, -0.5, 0.5);
	var rgb = CLARITY.Operations.YUVtoRGB({y:0.5, u:averageU, v:-averageV});
	rgb.r *= 255;
	rgb.g *= 255;
	rgb.b *= 255;

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var i = (y*frame.width + x)*4;

			if(frame.data[i] > 128){
				//its a hit
				output.data[i  ] = rgb.r;
				output.data[i+1] = rgb.g;
				output.data[i+2] = rgb.b;
			}
			else{
				output.data[i  ] = 0;
				output.data[i+1] = 0;
				output.data[i+2] = 0;
			}
		}
	}
	var midU = Math.round((averageU+0.5)*frame.width);
	var midV = Math.round((averageV+0.5)*frame.height);

	var i = (midV*frame.width + midU)*4;

	output.data[i  ] = 255-rgb.r;
	output.data[i+1] = 255-rgb.g;
	output.data[i+2] = 255-rgb.b;

	this.currentRGB = rgb;

	return output;
};

CLARITY.LIFX.prototype.getRGB = function(){
	return this.currentRGB;
}

CLARITY.LIFX.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('showField', this.properties.showField);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('showField');
	});

	return controls;
}
