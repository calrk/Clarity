
var CLARITY = {};
//Filter parent
CLARITY.Filter = function(options){
	var options = options || {};
	this.channel = options.channel || "grey";
};

CLARITY.Filter.prototype = {
	ctx: document.createElement('canvas').getContext('2d'),

	process: function(frame){
		return frame;
	},

	//gets the pixel value depending on which colour as a parameter
	getColourValue: function(data, pos, channel){
		var channel = this.channel || channel || "grey";

		switch(channel){
			case 'grey':
				return data.data[pos+0]*0.2989+data.data[pos+1]*0.5870+data.data[pos+2]*0.1140;
			case 'red':
				return data.data[pos+0];
			case 'green':
				return data.data[pos+1];
			case 'blue':
				return data.data[pos+2];
			default:
				// console.log('Unrecognised channel.');
				return data.data[pos+2];
		}
	}
}

//Dot Remover object
CLARITY.DotRemover = function(options){
	var options = options || {};
	this.neighboursReq = options.neighboursReq || 1;
	
	CLARITY.Filter.call( this, options );
}

CLARITY.DotRemover.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.DotRemover.prototype.process = function(frame){
	var outPut = this.ctx.createImageData(frame.width, frame.height);

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

			if(count <= this.neighboursReq){
				if(col > 138){
					outPut.data[i] = 0;
					outPut.data[i+1] = 0;
					outPut.data[i+2] = 0;
				}
				else{
					outPut.data[i] = 255;
					outPut.data[i+1] = 255;
					outPut.data[i+2] = 255;
				}
			}
			else{
				outPut.data[i] = col;
				outPut.data[i+1] = col;
				outPut.data[i+2] = col;
			}
			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};


//Posterise object
CLARITY.Posteriser = function(options){
	this.threshes = [128, 256];
	this.difference = 32;

	this.setThresh(64);
	CLARITY.Filter.call( this, options );
};

CLARITY.Posteriser.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Posteriser.prototype.process = function(frame){
	var outPut = ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshes[j] - this.difference/2;
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

CLARITY.Posteriser.prototype.setThresh = function(newNo){
	this.threshes = [];
	this.difference = newNo;
	var index = 0;
	for(var i = this.difference; i <= 256; i+= this.difference){
		this.threshes[index] = i;
		index ++;
	}
	this.threshes[index] = i;
};

//Smoother object
CLARITY.Smoother = function(options){
	var options = options || {};
	this. distance = options.distance || 1;
	this. iterations = options.iterations || 1;

	CLARITY.Filter.call( this, options );
}

CLARITY.Smoother.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Smoother.prototype.process = function(frame){
	var outPut = ctx.createImageData(frame.width, frame.height);

	for(var z = 0; z < this.iterations; z++){
		for(var y = this.distance; y < frame.height - this.distance; y++){
			for(var x = this.distance; x < frame.width - this.distance; x++){
				var i = (y*frame.width + x)*4;
				
				var up = ((y-this.distance)*frame.width + x)*4;
				var down = ((y+this.distance)*frame.width + x)*4;
				var left = (y*frame.width + (x-this.distance))*4;
				var right = (y*frame.width + (x+this.distance))*4;
				
				outPut.data[i+0] = (frame.data[left+0] + frame.data[right+0] + frame.data[up+0] + frame.data[down+0])/4;
				outPut.data[i+1] = (frame.data[left+1] + frame.data[right+1] + frame.data[up+1] + frame.data[down+1])/4;
				outPut.data[i+2] = (frame.data[left+2] + frame.data[right+2] + frame.data[up+2] + frame.data[down+2])/4;
				outPut.data[i+3] = 255;
			}
		}
	}

	return outPut;
};

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
	var outPut = this.ctx.createImageData(frame.width, frame.height);

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


//Motion Detector object
CLARITY.MotionDetector = function(options){
	this.frames = [];
	this.frameNo = 1;
	this.index = 0;
	this.preindex = this.frameNo;

	CLARITY.Filter.call( this, options );
};

CLARITY.MotionDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.MotionDetector.prototype.process = function(frame){
	var outPut = this.ctx.createImageData(frame.width, frame.height);

	this.pushFrame(frame);
	
	//waits until the buffer is full before trying to do stuff
	if(this.frames.length < this.frameNo+1){
		return outPut;
	}

	//does motion detecting
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		outPut.data[i+0] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		outPut.data[i+1] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		outPut.data[i+2] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		outPut.data[i+3] = 255;
	}
	return outPut;
};

CLARITY.MotionDetector.prototype.pushFrame = function(frame){
	//makes a new frame, then copies current frame data into it
	this.frames[this.index] = ctx.createImageData(frame.width, frame.height);
	for(var i = 0; i < frame.data.length; i++){
		this.frames[this.index].data[i] = frame.data[i];
	}
	//increments and bounds checks the index
	this.index ++;
	if(this.index > this.frameNo){
		this.index = 0;
	}
	//increments and bounds the preindex
	this.preindex ++;
	if(this.preindex > this.frameNo){
		this.preindex = 0;
	}
};

//Skin Detector object
CLARITY.SkinDetector = function(options){
	var options = options || {};
	this.componentised = options.componentised || false;

	CLARITY.Filter.call( this, options );
};

CLARITY.SkinDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.SkinDetector.prototype.process = function(frame){
	var outPut = this.ctx.createImageData(frame.width, frame.height);
	this.RGBAtoYCbCr(outPut, frame);
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		//values for skin colour sourced from http://www.journal.au.edu/ijcim/2007/jan07/IJCIMvol15no1_article3.pdf
		if(!this.componentised){
			if(outPut.data[i] > 30 && 
					80 < outPut.data[i+1] && outPut.data[i+1] < 121 && 
					133 < outPut.data[i+2] && outPut.data[i+2] < 173){
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
		//this code is for looking at the different aspects for tweaking the values
		else{
			if(outPut.data[i] > 30){
				outPut.data[i+0] = 255;
			}
			else{
				outPut.data[i+0] = 0;
			}

			if(80 < outPut.data[i+1] && outPut.data[i+1] < 121){
				outPut.data[i+1] = 255;
			}
			else{
				outPut.data[i+1] = 0;
			}

			if(133 < outPut.data[i+2] && outPut.data[i+2] < 173){
				outPut.data[i+2] = 255;
			}
			else{
				outPut.data[i+2] = 0;
			}
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//converts RGBA into YCbCr values for skin detection
//conversion functions sourced from lecture notes
CLARITY.SkinDetector.prototype.RGBAtoYCbCr = function(outPut, frame){
	var Y, Cb, Cr;
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		Y = 16 + (66*frame.data[i] + 129*frame.data[i+1] + 25*frame.data[i+2])/256;
		Cb = 128 + (-38*frame.data[i] - 74*frame.data[i+1] + 112*frame.data[i+2])/256;
		Cr = 128 + (112*frame.data[i] - 94*frame.data[i+1] - 18*frame.data[i+2])/256;

		outPut.data[i] = Y;
		outPut.data[i+1] = Cb;
		outPut.data[i+2] = Cr;
	}
};

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
	var outPut = this.ctx.createImageData(frame.width, frame.height);

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
//Median Threshold object
CLARITY.MedianThreshold = function(options){
	var threshes;

	CLARITY.Filter.call( this, options );
};

CLARITY.MedianThreshold.prototype = Object.create( CLARITY.Filter.prototype );

//The main function to do all the thresholding from
CLARITY.MedianThreshold.prototype.process = function(frame, thresh){
	var outPut = this.ctx.createImageData(frame.width, frame.height);

	//gets the threshold value
	this.threshes = this.getThresholdValues(frame);
	this.threshes.push(256);
	//performs the thresholding on the data
	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshes[j];
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

//gets the threshold values
CLARITY.MedianThreshold.prototype.getThresholdValues = function(data){
	var values = new Array();
	var median = [0,0,0];

	for(var i = 0; i < 256; i++){
		values[i] = 0;
	}

	for(var i = 0; i < data.data.length; i+=4){
		// if(data.data[i] != 0)
			values[data.data[i]] ++;
	}

	var cumulative = 0;
	var maximum = data.data.length/4/4;
	var pos = 0;
	for(var i = 0; i < 256; i++){
		cumulative += values[i];
		if(cumulative > maximum){
			maximum += data.data.length/4/4;
			median[pos] = i;
			pos++;
		}
	}

	return median;
}


//Difference detector object
CLARITY.DifferenceDetector = function(options){
	var options = options || {};
	this.original = null;

	CLARITY.Filter.call( this, options );
};

CLARITY.DifferenceDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.DifferenceDetector.prototype.process = function(frame){
		if(!this.original){
			this.original = frame;
			return frame;
		}

		var outPut = this.ctx.createImageData(frame.width, frame.height);

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			/*if(frame.data[i] != this.original.data[i] &&
					frame.data[i+1] != this.original.data[i+1] &&
					frame.data[i+2] != this.original.data[i+2]){*/
			var colour1 = [this.original.data[i], this.original.data[i+1], this.original.data[i+2]];
			var colour2 = [frame.data[i], frame.data[i+1], frame.data[i+2]];
			if(findDifference(colour2, colour1)){
				outPut.data[i]   = frame.data[i];
				outPut.data[i+1] = frame.data[i+1];
				outPut.data[i+2] = frame.data[i+2];
				outPut.data[i+3] = 255;
			}
			else{
				outPut.data[i]   = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
				outPut.data[i+3] = 255;
			}
		}

		return outPut;
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


//Contourer object
CLARITY.Contourer = function(options){
	var options = options || {}
	this.contours = options.contours || 10;

	this.threshes = [128, 256];
	this.threshSets = [0, 256];
	this.difference = 128;
	this.maxValue = 0;
	this.minValue = 255;

	CLARITY.Filter.call( this, options );
};

CLARITY.Contourer.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Contourer.prototype.process = function(frame){
	var outPut = this.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.data.length; i+=4){
		if(frame.data[i] > this.maxValue){
			this.maxValue = frame.data[i];
		}
		else if(frame.data[i] < this.minValue){
			this.minValue = frame.data[i];
		}
	}
	this.setVar(this.contours);

	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshSets[j];
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

CLARITY.Contourer.prototype.setVar = function(newNo){
	this.threshes = [];
	this.difference = (this.maxValue-this.minValue)/newNo;

	var index = 0;
	for(var i = this.difference+this.minValue; i <= 256; i+= this.difference){
		this.threshes[index] = i;
		this.threshSets[index] = (i-this.difference-this.minValue)/(this.maxValue-this.minValue)*255;
		index ++;
	}
	this.threshes[index] = i;
	this.threshSets[index] = 255;
};


CLARITY.Ghoster = function(options){
	var options = options || {};
	this.length = options.length || 10;
	this.frames = new Array();
	
	CLARITY.Filter.call( this, options );
};

CLARITY.Ghoster.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Ghoster.prototype.process = function(frame){
	this.frames.unshift(frame);
	if(this.frames.length > this.length){
		this.frames.pop();
	}

	var output = this.ctx.createImageData(width, height);

	for(var i = 0; i < frame.data.length; i+=4){
		for (var j = 0; j < this.frames.length; j++) {
			output.data[i]   += this.frames[j].data[i]  /this.frames.length*(j/this.frames.length*2);
			output.data[i+1] += this.frames[j].data[i+1]/this.frames.length*(j/this.frames.length*2);
			output.data[i+2] += this.frames[j].data[i+2]/this.frames.length*(j/this.frames.length*2);
		};
		output.data[i+3] = 255;
	}

	return output;
};

CLARITY.Puzzler = function(options){
	var options = options || {};
	this.width = 640;
	this.height = 480;

	this.selected;

	this.splits = 8;
	this.swaps = [];
	var count = 0;
	for(var i = 0; i < this.splits; i++){
		this.swaps[i] = [];
		for(var j = 0; j < this.splits; j++){
			this.swaps[i][j] = count++;
		}
	}

	for(var i = 0; i < 10*this.splits; i++){
		var a = Math.floor(Math.random()*this.splits);
		var b = Math.floor(Math.random()*this.splits);
		var c = Math.floor(Math.random()*this.splits);
		var d = Math.floor(Math.random()*this.splits);
		var temp = this.swaps[a][b];
		this.swaps[a][b] = this.swaps[c][d];
		this.swaps[c][d] = temp;
	}

	CLARITY.Filter.call( this, options );
};
CLARITY.Puzzler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Puzzler.prototype.process = function(frame){
	var output = this.ctx.createImageData(frame.width, frame.height);

	var minHeight = this.height/this.splits;
	var minWidth = this.width/this.splits;

	for(var y = 0; y < this.splits; y++){
		for(var x = 0; x < this.splits; x++){
			var pos = this.numToPos(this.swaps[x][y]);
			for(var newy = 0; newy < minHeight; newy++){
				for(var newx = 0; newx < minWidth; newx++){
					var pos1 = ((y*minHeight+newy)*frame.width + (x*minWidth+newx))*4;
					var pos2 = ((pos[1]*minHeight+newy)*frame.width + (pos[0]*minWidth+newx))*4;
					var pix2 = this.getPixel(frame.data, pos2);

					output.data[pos1]   = pix2[0];
					output.data[pos1+1] = pix2[1];
					output.data[pos1+2] = pix2[2];
					output.data[pos1+3] = 255;
				}
			}
		}
	}

	if(this.selected != undefined){
		for(var y = 0; y < this.height/this.splits; y++){
			for(var x = 0; x < this.width/this.splits; x++){
				var pos1 = ((this.selected[1]*(this.height/this.splits)+y)*this.width + (this.selected[0]*(this.width/this.splits)+x))*4;
				output.data[pos1+2] += 80;
			}
		}
	}

	return output;
}

CLARITY.Puzzler.prototype.getPixel = function(picture, pos){
	return [picture[pos], picture[pos+1], picture[pos+2]];
};

CLARITY.Puzzler.prototype.setPixel = function(picture, xPos, yPos, newCol){
	var pos = (yPos*this.width + xPos)*4;

	picture.data[pos] = newCol[0];
	picture.data[pos+1] = newCol[1];
	picture.data[pos+2] = newCol[2];
}

CLARITY.Puzzler.prototype.setClick = function(pos){
	var x = Math.floor(pos[0]/(this.width/this.splits));
	var y = Math.floor(pos[1]/(this.height/this.splits));

	if(this.selected){
		var temp = this.swaps[this.selected[0]][this.selected[1]];
		this.swaps[this.selected[0]][this.selected[1]] = this.swaps[x][y];
		this.swaps[x][y] = temp;

		this.selected = undefined;
	}
	else{
		this.selected = [x,y];
	}
}

CLARITY.Puzzler.prototype.numToPos = function(num){
	var x = 0;
	var y = 0;
	while(num > this.splits-1){
		num -= this.splits;
		x++;
	}
	y = num;
	return [x,y];
}
