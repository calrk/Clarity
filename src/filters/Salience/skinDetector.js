
//Skin Detector object
CLARITY.SkinDetector = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.SkinDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.SkinDetector.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);
	this.RGBAtoYCbCr(output, frame);
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		if(output.data[i] > 30 && 
				80 < output.data[i+1] && output.data[i+1] < 121 && 
				133 < output.data[i+2] && output.data[i+2] < 173){
			output.data[i+0] = 255;
			output.data[i+1] = 255;
			output.data[i+2] = 255;
		}
		else{
			output.data[i+0] = 0;
			output.data[i+1] = 0;
			output.data[i+2] = 0;
		}
		
		output.data[i+3] = 255;
	}

	return output;
};

//converts RGBA into YCbCr values for skin detection
//conversion functions sourced from lecture notes
CLARITY.SkinDetector.prototype.RGBAtoYCbCr = function(output, frame){
	var Y, Cb, Cr;
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		Y = 16 + (66*frame.data[i] + 129*frame.data[i+1] + 25*frame.data[i+2])/256;
		Cb = 128 + (-38*frame.data[i] - 74*frame.data[i+1] + 112*frame.data[i+2])/256;
		Cr = 128 + (112*frame.data[i] - 94*frame.data[i+1] - 18*frame.data[i+2])/256;

		output.data[i] = Y;
		output.data[i+1] = Cb;
		output.data[i+2] = Cr;
	}
};
