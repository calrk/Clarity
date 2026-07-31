
//Contourer object
CLARITY.Contourer = function(options){
	var options = options || {}
	this.properties = {
		contours: options.contours || 10
	}

	this.threshes = [128, 256];
	this.threshSets = [0, 256];
	this.difference = 128;
	this.maxValue = 0;
	this.minValue = 255;

	CLARITY.Filter.call( this, options );
};

CLARITY.Contourer.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Contourer.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	//recomputed per frame - these used to persist between frames, so on video the
	//range only ever widened and the contours drifted
	this.maxValue = 0;
	this.minValue = 255;
	for(var i = 0; i < frame.data.length; i+=4){
		//separate ifs: `else if` meant a pixel could only ever update one of the two,
		//so the first pixel set the max and never the min
		if(frame.data[i] > this.maxValue){
			this.maxValue = frame.data[i];
		}
		if(frame.data[i] < this.minValue){
			this.minValue = frame.data[i];
		}
	}

	//a flat image gives difference 0, which made the loop in setVar run forever
	if(this.maxValue == this.minValue){
		return output;
	}
	this.setVar(this.properties.contours);

	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					output.data[i] = this.threshSets[j];
					break;
				}
			}
		}
		else{
			output.data[i] = 255;
		}
	}

	return output;
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

CLARITY.Contourer.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 20, 1, 'contours', this.properties.contours);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('contours', e.srcElement.value);
	});

	return controls;
}
