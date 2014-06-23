
//StackBlur object
CLARITY.StackBlur = function(options){
	var options = options || {}

	this.processor = new CLARITY.StackBlurProcess();

	this.properties = {
		radius: options.radius || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.StackBlur.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.StackBlur.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	return this.processor.stackBlurCanvasRGBA(frame, 0, 0, frame.width, frame.height, this.properties.radius);
};

CLARITY.StackBlur.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 180, 1, 'radius', this.properties.radius);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('radius', e.srcElement.value);
	});

	return controls;
}
