//Tiler
//Tiles the image
CLARITY.Tiler = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Tiler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Tiler.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y+=2){
		for(var x = 0; x < frame.width; x+=2){
			var from = (y*frame.width + x)*4;

			//Top Left
			var toX = x/2;
			var toY = y/2;

			var to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];
			outPut.data[to+3] = 255;

			//Top Right
			toX = frame.width - x/2-1;
			toY = y/2;
			to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];
			outPut.data[to+3] = 255;

			//Bottom Left
			toX = x/2;
			toY = frame.height - y/2-1;
			to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];
			outPut.data[to+3] = 255;

			//Bottom Right
			toX = frame.width - x/2-1;
			toY = frame.height - y/2-1;
			to = (toY*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];
			outPut.data[to+3] = 255;
		}
	}

	return outPut;
};
