//Blend object
CLARITY.Blend = function(options){
	var options = options || {};

	this.properties = {
		ratio: CLARITY.Operations.clamp(options.ratio, 0, 1) || 0.5
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Blend.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Blend.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		outPut.data[i+0] = frame1.data[i  ]*this.properties.ratio + frame2.data[i  ]*(1-this.properties.ratio);
		outPut.data[i+1] = frame1.data[i+1]*this.properties.ratio + frame2.data[i+1]*(1-this.properties.ratio);
		outPut.data[i+2] = frame1.data[i+2]*this.properties.ratio + frame2.data[i+2]*(1-this.properties.ratio);
		outPut.data[i+3] = 255;
	}

	return outPut;
};


CLARITY.Blend.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'ratio', this.properties.ratio);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('ratio', e.srcElement.value);
	});

	return controls;
}
