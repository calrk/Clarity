
var CLARITY = {
	ctx: document.createElement('canvas').getContext('2d')
};
//Filter parent
CLARITY.Filter = function(options){
	var options = options || {};
	this.channel = options.channel || "grey";
};

CLARITY.Filter.prototype = {
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
			case 'r':
				return data.data[pos+0];
			case 'green':
			case 'g':
				return data.data[pos+1];
			case 'blue':
			case 'b':
				return data.data[pos+2];
			default:
				return data.data[pos+0]*0.2989+data.data[pos+1]*0.5870+data.data[pos+2]*0.1140;
		}
	}
}

//function with various image/pixel operations
CLARITY.Operations = {

	RGBtoHSV: function(input){
		var r, g, b;
		var h, s, v;
		var min, max, delta;

		for(var i = 0; i < input.data.length; i+=4){
			r = input.data[i];
			g = input.data[i+1];
			b = input.data[i+2];
			min = minimum([r, g, b]);
			max = maximum([r, g, b]);

			// console.log("min: " + min + "   max: " + max);

			v = max;
			delta = max - min;

			if(max != 0){
				s = delta / max;
			}
			else{
				s = 0;
				h = -1;
				return;
			}

			if(r == max)
				h = (g - b) / delta;		// between yellow & magenta
			else if(g == max)
				h = 2 + (b - r) / delta;	// between cyan & yellow
			else
				h = 4 + (r - g) / delta;	// between magenta & cyan
			
			h *= 60;						// degrees
			if(h < 0)
				h += 360;

			input.data[i]   = h; 
			input.data[i+1] = s;
			input.data[i+2] = v;
		}
	},

	HSVtoRGB: function(input){
		var i;
		var r, g, b;
		var h, s, v;
		var f, p, q, t;

		for(var j = 0; j < input.data.length; j+=4){
			h = input.data[j];
			s = input.data[j+1];
			v = input.data[j+2];

			if(s == 0){
				// achromatic (grey)
				r = g = b = v;
				continue;
			}
			h /= 60;			// sector 0 to 5
			i = Math.floor(h);
			f = h - i;			// factorial part of h
			p = v * (1 - s);
			q = v * (1 - s * f);
			t = v * (1 - s * (1 - f));
			switch(i){
				case 0:
					r = v;
					g = t;
					b = p;
					break;
				case 1:
					r = q;
					g = v;
					b = p;
					break;
				case 2:
					r = p;
					g = v;
					b = t;
					break;
				case 3:
					r = p;
					g = q;
					b = v;
					break;
				case 4:
					r = t;
					g = p;
					b = v;
					break;
				default:
					r = v;
					g = p;
					b = q;
					break;
			}
			input.data[j]   = r; 
			input.data[j+1] = g;
			input.data[j+2] = b;
		}
	},

	minimum: function(ins){
		var out = 256;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] < out){
				out = ins[i];
			}
		}
		return out;
	},

	maximum: function(ins){
		var out = 0;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] > out){
				out = ins[i];
			}
		}
		return out;
	}

};


//function with various image/pixel operations
CLARITY.Pixel = function(r, g, b){
	this.r = 0;
	this.g = 0;
	this.b = 0;

	this.h = 0;
	this.s = 0;
	this.v = 0;

	this.setFromRGB(r, g, b);
};

CLARITY.Pixel.prototype = {
	getColourValue: function(channel){
		var channel = this.channel || channel || "grey";

		switch(channel){
			case 'grey':
				return this.r*0.2989+this.g*0.5870+this.b*0.1140;
			case 'red':
			case 'r':
				return this.r;
			case 'green':
			case 'g':
				return this.g;
			case 'blue':
			case 'b':
				return this.b;

			case 'hue':
			case 'h':
				return this.h;
			case 'saturation':
			case 's':
				return this.s;
			case 'value':
			case 'v':
				return this.v;
			default:
				return this.r*0.2989+this.g*0.5870+this.b*0.1140;
		}
	},

	setFromRGB: function(r, g, b){
		var min, max, delta;
		this.r = r;
		this.g = g;
		this.b = b;

		min = minimum([this.r, this.g, this.b]);
		max = maximum([this.r, this.g, this.b]);

		this.v = max;
		delta = max - min;

		if(max != 0){
			this.s = delta / max;
		}
		else{
			this.s = 0;
			this.h = -1;
			return;
		}

		if(this.r == max)
			this.h = (this.g - this.b) / delta;		// between yellow & magenta
		else if(this.g == max)
			this.h = 2 + (this.b - this.r) / delta;	// between cyan & yellow
		else
			this.h = 4 + (this.r - this.g) / delta;	// between magenta & cyan
		
		this.h *= 60;						// degrees
		if(this.h < 0)
			this.h += 360;
	},

	setFromHSV: function(h, s, v){
		var i;
		var f, p, q, t;
		
		this.h = h;
		this.s = s;
		this.v = v;

		if(this.s == 0){//grey
			this.r = this.g = this.b = this.v;
			return;
		}

		i =  Math.floor(this.h/60);
		f = this.h - i;			// factorial part of h
		p = this.v * (1 - this.s);
		q = this.v * (1 - this.s * f);
		t = this.v * (1 - this.s * (1 - f));

		switch(i){
			case 0:
				this.r = v;
				this.g = t;
				this.b = p;
				break;
			case 1:
				this.r = q;
				this.g = v;
				this.b = p;
				break;
			case 2:
				this.r = p;
				this.g = v;
				this.b = t;
				break;
			case 3:
				this.r = p;
				this.g = q;
				this.b = v;
				break;
			case 4:
				this.r = t;
				this.g = p;
				this.b = v;
				break;
			default:
				this.r = v;
				this.g = p;
				this.b = q;
				break;
		}
	}
}


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
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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


//NormalGenerator object
//Contains a bit of vector maths, which may be pulled out in future if other filters require it
CLARITY.NormalGenerator = function(options){
	var options = options || {}
	this.heightMod = options.heightMod || 0.15;

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalGenerator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalGenerator.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;
			var up    = ((y-1)*frame.width + x)*4;
			var down  = ((y+1)*frame.width + x)*4;
			var left  = (y*frame.width + (x-1))*4;
			var right = (y*frame.width + (x+1))*4;

			var veci =     {x:x, y:y,   z: this.heightMod*frame.data[i]};
			var vecup =    {x:x, y:y-1, z: this.heightMod*frame.data[up]};
			var vecdown =  {x:x, y:y+1, z: this.heightMod*frame.data[down]};
			var vecleft =  {x:x-1, y:y, z: this.heightMod*frame.data[left]};
			var vecright = {x:x+1, y:y, z: this.heightMod*frame.data[right]};

			var res = this.generateNormal(veci, vecleft, vecright, vecup, vecdown)

			outPut.data[i] =   255-(res.x/2+128);
			outPut.data[i+1] = 255-(res.y/2+128);
			outPut.data[i+2] = -res.z;

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.NormalGenerator.prototype.generateNormal = function(centreIn, leftIn, rightIn, upIn, downIn){
	var left  = this.calcNormal(centreIn, upIn,    leftIn);
    var right = this.calcNormal(centreIn, leftIn,  downIn);
    var up    = this.calcNormal(centreIn, downIn,  rightIn);
    var down  = this.calcNormal(centreIn, rightIn, upIn);

    var avg = this.average(left, right, up, down);

    return avg;
}

CLARITY.NormalGenerator.prototype.calcNormal = function(vcentre, v1, v2){
	var res1 = this.vectorSub(vcentre, v1);
	var res2 = this.vectorSub(vcentre, v2);
    var cross = this.crossProduct(res1, res2);
    cross = this.normalise(cross);
    return cross
}

CLARITY.NormalGenerator.prototype.vectorSub = function(v1, v2){
	return {
		x: v1.x-v2.x, 
		y: v1.y-v2.y, 
		z: v1.z-v2.z
	};
}

CLARITY.NormalGenerator.prototype.vectorAdd = function(v1, v2){
	return {
		x: v1.x+v2.x, 
		y: v1.y+v2.y, 
		z: v1.z+v2.z
	};
}

CLARITY.NormalGenerator.prototype.crossProduct = function(v1, v2){
	return {
		x:   v1.y*v2.z - v1.z*v2.y,
		y: -(v1.x*v2.z - v1.z*v2.x),
		z:   v1.x*v2.y - v1.y*v2.x
	}
}

CLARITY.NormalGenerator.prototype.normalise = function(v){
	var mag = Math.sqrt(Math.abs(v.x*v.x + v.y*v.y + v.z*v.z));
	return{
		x: v.x/mag,
		y: v.y/mag,
		z: v.z/mag
	}
}

CLARITY.NormalGenerator.prototype.average = function(v1, v2, v3, v4){
	var res = this.vectorAdd(v1, v2);
	res = this.vectorAdd(res, v3);
	res = this.vectorAdd(res, v4);

	res = this.normalise(res);
	return {
		x: res.x*255,
		y: res.y*255,
		z: res.z*255
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
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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

//TODO: Make this reduce image to a set number of colours, rather than rgb quantisation

//Posterise object
CLARITY.Posteriser = function(options){
	this.threshes = [128, 256];
	this.difference = 32;

	this.setThresh(64);
	CLARITY.Filter.call( this, options );
};

CLARITY.Posteriser.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Posteriser.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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
	this.distance = options.distance || 1;
	this.iterations = options.iterations || 1;

	CLARITY.Filter.call( this, options );
}

CLARITY.Smoother.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Smoother.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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
	this.frames[this.index] = CLARITY.ctx.createImageData(frame.width, frame.height);
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
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
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
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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
	var average;
	average = this.getColourValue(data, 0);
	//finds the intial average of all the data
	for(var i = 4; i < data.width*data.height*4; i+=4){
		var colour = this.getColourValue(data, i);
		average = (average+colour)/2;
	}

	var lower = 0;
	var upper = 0;
	var previous = 0;
	var current = average;
	//checks to see if the new average is near the old average
	while(!(previous > current - 1 && previous < current + 1)){
		previous = current;
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
	}
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
//Median Threshold object
CLARITY.MedianThreshold = function(options){
	var threshes;

	CLARITY.Filter.call( this, options );
};

CLARITY.MedianThreshold.prototype = Object.create( CLARITY.Filter.prototype );

//The main function to do all the thresholding from
CLARITY.MedianThreshold.prototype.process = function(frame, thresh){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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

//TODO: Make work properly
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

		var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

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

	var output = CLARITY.ctx.createImageData(width, height);

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

//Scrambles the canvas scene
CLARITY.Puzzler = function(options){
	var options = options || {};
	this.width = options.width || 640;
	this.height = options.height || 480;

	this.selected = null;

	this.splits = options.splits || 8;
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
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

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

/*
//Shot Detector object
CLARITY.ShotDetector = function(options){
	var count = [];
	var postCount = [];
	var frames = [];
	var dilateFrames = [];
	var index = 1;
	var prevECR = 0;
	var cutTime = 0;

	CLARITY.Filter.call( this, options );
};

CLARITY.Puzzler.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Puzzler.prototype.process = function(frame){
	var outPut = cxt.createImageData(frame.width, frame.height);
	cxt2.putImageData(outPut, 0, 0);
	
	this.pushFrame(frame);

	//waits until the buffer is full before trying to do stuff
	if(frames.length < 2 || dilateFrames.length < 2){
		log("returning");
		return outPut;
	}

	//create new image data
	var postProcess = cxt.createImageData(frame.width, frame.height);

	//does the first compare, first frame times second dilation
	for(var i = 0; i < frames[index].data.length; i+=4){
		postProcess.data[i+0] = dilateFrames[1].data[i+0] * frames[0].data[i+0];
		postProcess.data[i+1] = dilateFrames[1].data[i+1] * frames[0].data[i+1];
		postProcess.data[i+2] = dilateFrames[1].data[i+2] * frames[0].data[i+2];
		postProcess.data[i+3] = 255;
	}
	//counts how many pixels are on after this
	for(var i = 0; i < frames[index].data.length; i+=4){
		if(postProcess.data[i] > 128){
			postCount[index] ++;
		}
	}

	//does the second compare, second frame times first dilation
	for(var i = 0; i < frames[index].data.length; i+=4){
		postProcess.data[i+0] = dilateFrames[0].data[i+0] * frames[1].data[i+0];
		postProcess.data[i+1] = dilateFrames[0].data[i+1] * frames[1].data[i+1];
		postProcess.data[i+2] = dilateFrames[0].data[i+2] * frames[1].data[i+2];
		postProcess.data[i+3] = 255;
	}

	//counts how many pixels are on after this
	for(var i = 0; i < frames[index].data.length; i+=4){
		if(postProcess.data[i] > 128){
			postCount[!index] ++;
		}
	}

	//calculate the edge change ratio between the two frames
	var ECR = maximum([postCount[0]/count[0], postCount[1]/count[1]]);
	ECR = postCount[0]/count[0] + postCount[1]/count[1];
	
	//compares the previous ECR with the current ECR to see if theres much difference
	var shot = false;
	if(Math.abs(ECR - prevECR) > 0.2){
		shot = true;
	}
	prevECR = ECR;
	log(ECR);

	if(cutTime > 0){
		cutTime --;
		shot = false;
	}
	//shows white if it detects a shot, black if not
	for(var i = 0; i < outPut.data.length; i++){
		if(shot){
			cutTime = 3;
			log("shot detected");
			outPut.data[i] = 255;
		}
		else{
			outPut.data[i] = 0;
		}
	}

	return outPut;
};

	//used for analysis, to push frames on without processing them
	this.pushFrame = function(frame){
		//gets the edges of the new frame
		var edgeDetector = new EdgeDetector();
		var threshOld = thresheld;
		thresheld = true;
		var outPut = edgeDetector.process(frame);
		thresheld = threshOld;

		//increments and bounds checks the index
		index ++;
		if(index > 1){
			index = 0;
		}
		//makes a new frame, then copies the edge data into it
		frames[index] = cxt.createImageData(frame.width, frame.height);
		for(var i = 0; i < outPut.data.length; i++){
			frames[index].data[i] = outPut.data[i];
		}

		//resets the counts
		count[index] = 0;
		postCount[index] = 0;

		//dilates the image
		for(var y = 0; y < frame.height*4; y+=4){
			for(var x = 0; x < frame.width*4; x+=4){
				var i = y*frame.width + x;
				if(frames[index].data[i] > 128){
					cxt2.fillStyle = "#FFFFFF";
					cxt2.beginPath();
					cxt2.arc(x/4, y/4, 5, 5, Math.PI*2, true); 
					cxt2.closePath();
					cxt2.fill();
					count[index] ++;
				}
			}
		}

		//gets dilate image data, and sets alpha channel to 255
		dilateFrames[index] = cxt2.getImageData(0, 0, frame.width, frame.height);
		for(var i = 3; i < dilateFrames[index].data.length; i+=4){
			dilateFrames[index].data[i] = 255;
		}
	};

//returns the maximum value of the inputs in ins
	function maximum(ins){
		var out = 0;
		for(var i = 0; i < ins.length; i++){
			if(ins[i] > out){
				out = ins[i];
			}
		}
		return out;
	}
}
*/