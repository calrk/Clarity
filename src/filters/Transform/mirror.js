//Mirror
//Mirrors the image in x or y
CLARITY.Mirror = function(options){
	var options = options || {};
	this.mirrorX = options.mirrorX || true;
	this.mirrorY = options.mirrorY || false;

	CLARITY.Filter.call( this, options );
};

CLARITY.Mirror.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Mirror.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var from = (y*frame.width + x)*4;
			var toX = x;
			var toY = y;
			if(this.mirrorX){
				toX = frame.width-x;
			}
			if(this.mirrorY){
				toY = frame.height-y;
			}

			var to = ((toY)*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];

			outPut.data[to+3] = 255;
		}
	}

	return outPut;
};