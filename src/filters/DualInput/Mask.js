//Mask object
CLARITY.Mask = function(options){
	var options = options || {};

	CLARITY.Filter.call( this, options );
};

CLARITY.Mask.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Mask.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		if(frame2[i].data < 128){
			outPut.data[i+0] = frame1.data[i  ];
			outPut.data[i+1] = frame1.data[i+1];
			outPut.data[i+2] = frame1.data[i+2];
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