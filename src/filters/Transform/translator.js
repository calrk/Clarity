//Translator
//Translates the image by the percentages specified
CLARITY.Translator = function(options){
	var options = options || {};

	this.properties = {
		horizontal: CLARITY.Operations.clamp(options.horizontal || 0.5, -1, 1),
		verticle: CLARITY.Operations.clamp(options.verticle || 0.5, -1, 1)
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Translator.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Translator.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);
	var xTranslate = Math.ceil(frame.width * this.properties.horizontal);
	var yTranslate = Math.ceil(frame.height * this.properties.verticle);

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

CLARITY.Translator.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'Vertical', this.properties.vertical);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('verticle', e.srcElement.value);
	});

	slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'Horizontal', this.properties.horizontal);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setFloat('horizontal', e.srcElement.value);
	});

	return controls;
}
