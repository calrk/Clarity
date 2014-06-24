//Mask object
CLARITY.Mask = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Mask.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Mask.prototype.doProcess = function(frame1, frame2){
	var output = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		if(frame2[i].data < 128){
			output.data[i+0] = frame1.data[i  ];
			output.data[i+1] = frame1.data[i+1];
			output.data[i+2] = frame1.data[i+2];
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


/*CLARITY.Mask.prototype.doCreateControls = function(titleSet){
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