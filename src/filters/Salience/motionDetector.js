
//Motion Detector object
CLARITY.MotionDetector = function(options){
	this.frames = [];
	this.index = 0;
	var options = options || {};
	
	this.properties = {
		frameCount: options.frameCount || 1
	}
	this.preindex = this.properties.frameCount;

	CLARITY.Filter.call( this, options );
};

CLARITY.MotionDetector.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.MotionDetector.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	this.pushFrame(frame);
	
	//waits until the buffer is full before trying to do stuff
	if(this.frames.length < this.properties.frameCount+1){
		return output;
	}

	//does motion detecting
	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		output.data[i+0] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		output.data[i+1] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		output.data[i+2] = Math.abs(this.getColourValue(this.frames[this.preindex], i) - this.getColourValue(this.frames[this.index], i));
		output.data[i+3] = 255;
	}
	return output;
};

CLARITY.MotionDetector.prototype.pushFrame = function(frame){
	//makes a new frame, then copies current frame data into it
	this.frames[this.index] = CLARITY.ctx.createImageData(frame.width, frame.height);
	for(var i = 0; i < frame.data.length; i++){
		this.frames[this.index].data[i] = frame.data[i];
	}
	//increments and bounds checks the index
	this.index ++;
	if(this.index > this.properties.frameCount){
		this.index = 0;
	}
	//increments and bounds the preindex
	this.preindex ++;
	if(this.preindex > this.properties.frameCount){
		this.preindex = 0;
	}
};

CLARITY.MotionDetector.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 24, 1, 'Frame Count', this.properties.frameCount);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('frameCount', e.srcElement.value);

		self.index = 0;
		self.preindex = e.srcElement.value-1;
		self.frames = [];
	});

	return controls;
}
