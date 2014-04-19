//Average Threshold object
CLARITY.AverageThreshold = function(options){
	var options = options || {};
	this.inverted = options.inverted || false;
	this.thresh = options.thresh || null;
	
	CLARITY.Filter.call( this, options );
};

CLARITY.AverageThreshold.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.AverageThreshold.prototype.process = function(frame){
	var outPut = this.ctx.createImageData(frame.width, frame.height);

	//gets the threshold value
	var threshold = this.thresh || this.getThresholdValue(frame);
	//performs the thresholding on the data
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		var colour = this.getColourValue(frame, i, this.channel);
		if(this.inverted){
			if(colour < threshold){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}
		}
		else{
			if(colour > threshold){
				outPut.data[i+0] = 255;
				outPut.data[i+1] = 255;
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+0] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//used to get an iterative average threshold value
CLARITY.AverageThreshold.prototype.getThresholdValue = function(data){
	log("Getting threshold value.");
	var average;
	average = this.getColourValue(data, 0);
	//finds the intial average of all the data
	for(var i = 4; i < data.width*data.height*4; i+=4){
		var colour = this.getColourValue(data, i);
		average = (average+colour)/2;
	}
	log("average " + average);

	var lower = 0;
	var upper = 0;
	var previous = 0;
	var current = average;
	//checks to see if the new average is near the old average
	while(!(previous > current - 1 && previous < current + 1)){
		previous = current;
		log("previous: " + previous);
		//splits the data up depending on the current threshold, and finds an average of each
		for(var i = 0; i < data.width*data.height*4; i+=4){
			var colour = this.getColourValue(data, i);
			if(colour < previous){
				if(lower == 0){
					lower = colour;
				}
				else{
					lower = (lower + colour)/2;
				}
			}
			else{
				if(upper == 0){
					upper = colour;
				}
				else{
					upper = (upper + colour)/2;
				}
			}
		}
		//averages the two averages
		current = (upper+lower)/2;
		lower = 0;
		upper = 0;
		log("current: " + current);
	}
	log("final: " + current);
	return current;
}
