//Edge detector object
CLARITY.EdgeDetector = function(options){
	var options = options || {};
	this.fast = options.fast || false;
	this.channel = options.channel || "grey";

	this.kernel = [ [ -1, -1, -1],
				   [ -1,  8, -1],
				   [ -1, -1, -1]];
	/*this.kernel = [ [ 0, 0, 0],
				   [ 0, 3, 0],
				   [ 0, 0, -3]];*/

	CLARITY.Filter.call( this, options );
};

CLARITY.EdgeDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.EdgeDetector.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	if(!this.fast){
		for(var y = 4; y < frame.height*4-4; y+=4){
			for(var x = 4; x < frame.width*4-4; x+=4){
				var sum = 0; // Kernel sum for this pixel
				for(var ky = -1; ky <= 1; ky++){
					for(var kx = -1; kx <= 1; kx++){
						// Calculate the adjacent pixel for this kernel point
						var pos = (y + ky*4)*frame.width + (x + kx*4);
						// Image is grayscale, red/green/blue are identical
						var val = this.getColourValue(frame, pos);
						// Multiply adjacent pixels based on the kernel values
						sum += this.kernel[ky+1][kx+1] * val;
					}
				}
				outPut.data[y*frame.width + x] = sum;
				outPut.data[y*frame.width + x+1] = sum;
				outPut.data[y*frame.width + x+2] = sum;
				outPut.data[y*frame.width + x+3] = 255;
			}
		}
	}
	else{//a more fast edge detection, between 2 points only
		for(var y = 4; y < frame.height*4-4; y+=4){
			for(var x = 4; x < frame.width*4-4; x+=4){
				var i = y*frame.width + x;
				outPut.data[i]   = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
				outPut.data[i+1] = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
				outPut.data[i+2] = Math.abs(this.getColourValue(frame, i+4)-this.getColourValue(frame, i))*5;
			
				outPut.data[i+3] = 255;
			}
		}
	}

	return outPut;
};
