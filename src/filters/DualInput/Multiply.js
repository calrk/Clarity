//Multiply object
CLARITY.Multiply = function(options){
	var options = options || {};

	/*this.properties = {
		ratio: CLARITY.Operations.clamp(options.ratio, 0, 1) || 0.5
	};*/

	CLARITY.Filter.call( this, options );
};

CLARITY.Multiply.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Multiply.prototype.doProcess = function(frame1, frame2){
	var output = CLARITY.ctx.createImageData(frame1.width, frame2.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		output.data[i+0] = ((frame1.data[i  ]/255) * (frame2.data[i  ])/255)*255;
		output.data[i+1] = ((frame1.data[i+1]/255) * (frame2.data[i+1])/255)*255;
		output.data[i+2] = ((frame1.data[i+2]/255) * (frame2.data[i+2])/255)*255;
		output.data[i+3] = 255;
	}

	return output;
};


/*CLARITY.Multiply.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 1, 0.01, 'ratio', this.properties.ratio);
	controls.appendChild(slider);
	slider.getElementsByTagName('input')[0].addEventListener('change', function(e){
		self.setFloat('ratio', e.srcElement.value);
	});

	return controls;
}
*/