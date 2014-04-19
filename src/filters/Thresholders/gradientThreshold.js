
//Gradient Threshold object
CLARITY.GradientThreshold = function(options){
	var options = options || {};
	this.thresh = options.thresh || 20;
	this.distance = options.distance || 1;

	CLARITY.Filter.call( this, options );
};

CLARITY.GradientThreshold.prototype = Object.create( CLARITY.Filter.prototype );

//The main function to do all the thresholding from
CLARITY.GradientThreshold.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var found = false;
	for(var y = this.distance; y < frame.height - this.distance; y++){
		for(var x = this.distance; x < frame.width - this.distance; x++){
			found = false;
			var i = (y*frame.width + x)*4;
			var up = ((y-this.distance)*frame.width + x)*4;
			var down = ((y+this.distance)*frame.width + x)*4;
			var left = (y*frame.width + (x-this.distance))*4;
			var right = (y*frame.width + (x+this.distance))*4;
			
			if(frame.data[i] < frame.data[left] - this.thresh){
				found = true;
			}
			else if(frame.data[i] > frame.data[left] + this.thresh){
				found = true;
			}
			else if(frame.data[i] < frame.data[right] - this.thresh){
				found = true;
			}
			else if(frame.data[i] > frame.data[right] + this.thresh){
				found = true;
			}
			else if(frame.data[i] < frame.data[up] - this.thresh){
				found = true;
			}
			else if(frame.data[i] > frame.data[up] + this.thresh){
				found = true;
			}
			else if(frame.data[i] < frame.data[down] - this.thresh){
				found = true;
			}
			else if(frame.data[i] > frame.data[down] + this.thresh){
				found = true;
			}
			if(found){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
				outPut.data[i+3] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
				outPut.data[i+3] = 255;	
			}
			
		}
	}
	return outPut;
};

/*function GradientThresholderNM(){
	var thresh = 240;

	this.process = function(frame){
		var outPut = ctx.createImageData(frame.width, frame.height);
		for(var y = 0; y < frame.height; y++){
			for(var x = 0; x < frame.width; x++){
				var i = (y*frame.width + x)*4;
				// if(frame.data[i] > 128 + thresh || frame.data[i] < 128 - thresh ||
					// frame.data[i+1] > 128 + thresh || frame.data[i+1] < 128 - thresh){
				if(frame.data[i+2] < thresh){
					outPut.data[i+0] = 255;
					outPut.data[i+1] = 255;
					outPut.data[i+2] = 255;
					outPut.data[i+3] = 255;
				}
				else{
					outPut.data[i+0] = 0;
					outPut.data[i+1] = 0;
					outPut.data[i+2] = 0;
					outPut.data[i+3] = 255;	
				}
			}
		}
		return outPut;
	}
}
*/