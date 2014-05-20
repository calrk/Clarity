//Skin Detector object
CLARITY.SkinDetector = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.SkinDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.SkinDetector.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	this.RGBAtoYCbCr(outPut, frame);
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
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
