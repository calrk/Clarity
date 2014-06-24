//Desaturate object
CLARITY.Desaturate = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Desaturate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Desaturate.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var colour = this.getColourValue(frame, i, 'grey');
		
		output.data[i+0] = colour;
		output.data[i+1] = colour;
		output.data[i+2] = colour;
		output.data[i+3] = 255;
	}

	return output;
};
