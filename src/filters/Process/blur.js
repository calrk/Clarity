
//Blur object
//Currently uses StackBlur, maybe add more in future.
CLARITY.Blur = function(options){
	var options = options || {}

	this.processor = new CLARITY.StackBlurProcess();

	this.properties = {
		radius: options.radius || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Blur.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Blur.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	if(this.propeties.radius < 1){
		return frame;
	}

	var output = ctx.createImageData(frame.width, frame.height);
    output.data.set(frame.data);

	return this.processor.stackBlurCanvasRGB(output, this.properties.radius);
};

CLARITY.Blur.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(1, 180, 1, 'radius', this.properties.radius);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('radius', e.srcElement.value);
	});

	return controls;
}
