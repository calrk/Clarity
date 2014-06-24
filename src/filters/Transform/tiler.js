//Tiler
//Tiles the image
CLARITY.Tiler = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Tiler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Tiler.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 0; y < frame.height; y+=2){
		for(var x = 0; x < frame.width; x+=2){
			var from1 = (y*frame.width + x)*4;
			var from2 = (y*frame.width + x+1)*4;
			var from3 = ((y+1)*frame.width + x)*4;
			var from4 = ((y+1)*frame.width + x+1)*4;

			//Top Left
			var toX = x/2;
			var toY = y/2;

			var to = (toY*frame.width + toX)*4;
			
			output.data[to] = frame.data[from1];
			output.data[to+1] = frame.data[from1+1];
			output.data[to+2] = frame.data[from1+2];
			output.data[to+3] = 255;

			//Top Right
			toX = frame.width - x/2-1;
			toY = y/2;
			to = (toY*frame.width + toX)*4;
			
			output.data[to] = frame.data[from2];
			output.data[to+1] = frame.data[from2+1];
			output.data[to+2] = frame.data[from2+2];
			output.data[to+3] = 255;

			//Bottom Left
			toX = x/2;
			toY = frame.height - y/2-1;
			to = (toY*frame.width + toX)*4;
			
			output.data[to] = frame.data[from3];
			output.data[to+1] = frame.data[from3+1];
			output.data[to+2] = frame.data[from3+2];
			output.data[to+3] = 255;

			//Bottom Right
			toX = frame.width - x/2-1;
			toY = frame.height - y/2-1;
			to = (toY*frame.width + toX)*4;
			
			output.data[to] = frame.data[from4];
			output.data[to+1] = frame.data[from4+1];
			output.data[to+2] = frame.data[from4+2];
			output.data[to+3] = 255;
		}
	}

	return output;
};
