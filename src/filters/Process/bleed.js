
//Bleed object
CLARITY.Bleed = function(options){
	var options = options || {}

	this.processor = new CLARITY.StackBlurProcess();

	this.properties = {
		radius: options.radius || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Bleed.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Bleed.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	var output = ctx.createImageData(frame.width, frame.height);
    output.data.set(frame.data);

	return this.processor.stackBlurCanvasSingle(output, this.properties.radius);
};

CLARITY.Bleed.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 180, 1, 'radius', this.properties.radius);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('radius', e.srcElement.value);
	});

	return controls;
}
