//TODO: Make work properly
//Difference detector object
CLARITY.DifferenceDetector = function(options){
	var options = options || {};
	this.original = null;

	CLARITY.Filter.call( this, options );
};

CLARITY.DifferenceDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.DifferenceDetector.prototype.doProcess = function(frame){
		if(!this.original){
			this.original = frame;
			return frame;
		}

		var output = CLARITY.ctx.createImageData(frame.width, frame.height);

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			/*if(frame.data[i] != this.original.data[i] &&
					frame.data[i+1] != this.original.data[i+1] &&
					frame.data[i+2] != this.original.data[i+2]){*/
			var colour1 = [this.original.data[i], this.original.data[i+1], this.original.data[i+2]];
			var colour2 = [frame.data[i], frame.data[i+1], frame.data[i+2]];
			if(findDifference(colour2, colour1)){
				output.data[i]   = frame.data[i];
				output.data[i+1] = frame.data[i+1];
				output.data[i+2] = frame.data[i+2];
				output.data[i+3] = 255;
			}
			else{
				output.data[i]   = 0;
				output.data[i+1] = 0;
				output.data[i+2] = 0;
				output.data[i+3] = 255;
			}
		}

		return output;
	};

CLARITY.DifferenceDetector.prototype.resetOriginal = function(){
	this.original = null;
};

CLARITY.DifferenceDetector.prototype.findDifference = function(pix1, pix2){
	if(pix1[0] < pix2[0] + 75 && pix1[0] > pix2[0] - 75){
		if(pix1[1] < pix2[1] + 75 && pix1[1] > pix2[1] - 75){
			if(pix1[2] < pix2[2] + 75 && pix1[2] > pix2[2] - 75){
				return false;
			}
		}
	}
	return true;
};
