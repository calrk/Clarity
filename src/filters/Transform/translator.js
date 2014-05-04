//Translator
//Translates the image by the percentages specified
CLARITY.Translator = function(options){
	var options = options || {};
	this.xTrans = CLARITY.Operations.clamp(options.xTrans || 0.5, -1, 1);
	this.yTrans = CLARITY.Operations.clamp(options.yTrans || 0.5, -1, 1);

	CLARITY.Filter.call( this, options );
};

CLARITY.Translator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Translator.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	var xTranslate = Math.ceil(frame.width * this.xTrans);
	var yTranslate = Math.ceil(frame.height * this.yTrans);

	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var from = (y*frame.width + x)*4;
			var toX = x + xTranslate;
			var toY = y + yTranslate;
			if(toX > frame.width){
				toX -= frame.width;
			}
			else if(toX < 0){
				toX += frame.width;
			}
			if(toY > frame.height){
				toY -= frame.height;
			}
			else if(toY < 0){
				toY += frame.height;
			}
			var to = ((toY)*frame.width + toX)*4;
			
			outPut.data[to] = frame.data[from];
			outPut.data[to+1] = frame.data[from+1];
			outPut.data[to+2] = frame.data[from+2];

			outPut.data[to+3] = 255;
		}
	}

	return outPut;
};
