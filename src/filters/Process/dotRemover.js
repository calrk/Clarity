
//Dot Remover object
CLARITY.DotRemover = function(options){
	var options = options || {};

	//was a bare `this.neighboursReq`, which the base class's setInt couldn't reach
	this.properties = {
		neighboursReq: options.neighboursReq || 1
	};

	CLARITY.Filter.call( this, options );
}

CLARITY.DotRemover.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.DotRemover.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	//the loop skips a one pixel border, which would otherwise stay transparent
	for(var a = 3; a < output.data.length; a += 4){
		output.data[a] = 255;
	}

	for(var y = 1; y < frame.height - 1; y++){
		for(var x = 1; x < frame.width - 1; x++){
			var i = (y*frame.width + x)*4;
			
			var up = ((y-1)*frame.width + x)*4;
			var down = ((y+1)*frame.width + x)*4;
			var left = (y*frame.width + (x-1))*4;
			var right = (y*frame.width + (x+1))*4;
			
			var col = frame.data[i];
			var count = 0;
			if(frame.data[up] == col) count++;
			if(frame.data[down] == col) count++;
			if(frame.data[left] == col) count++;
			if(frame.data[right] == col) count++;

			if(count <= this.properties.neighboursReq){
				if(col > 138){
					output.data[i] = 0;
					output.data[i+1] = 0;
					output.data[i+2] = 0;
				}
				else{
					output.data[i] = 255;
					output.data[i+1] = 255;
					output.data[i+2] = 255;
				}
			}
			else{
				output.data[i] = col;
				output.data[i+1] = col;
				output.data[i+2] = col;
			}
			output.data[i+3] = 255;
		}
	}

	return output;
};
