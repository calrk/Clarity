//hsvShifter object
CLARITY.hsvShifter = function(options){
	var options = options || {};

	this.hue = options.hue || 0;
	this.saturation = options.saturation || 1;
	this.value = options.value || options.lightness || 1;

	CLARITY.Filter.call( this, options );
};

CLARITY.hsvShifter.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.hsvShifter.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var col = CLARITY.Operations.RGBtoHSV([frame.data[i], frame.data[i+1], frame.data[i+2]]);
		
		col[0] += this.hue;
		if(col[0] > 360){
			col[0] -= 360;
		}
		col[1] *= this.saturation;
		col[2] *= this.value;
		
		col = CLARITY.Operations.HSVtoRGB([col[0], col[1], col[2]]);
		
		outPut.data[i+0] = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};
