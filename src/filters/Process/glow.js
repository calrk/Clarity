
//Glow object
CLARITY.Glow = function(options){
	var options = options || {}

	this.processor = new CLARITY.StackBlurProcess();

	this.properties = {
		radius: options.radius || 10
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Glow.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Glow.prototype.doProcess = function(frame){
	var blur = new CLARITY.Blur({radius: this.properties.radius}).process(frame);
	var blend = new CLARITY.Blend({ratio: 0.5}).process([frame, blur]);

	return blend;
};

CLARITY.Glow.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var slider = CLARITY.Interface.createSlider(0, 180, 1, 'radius', this.properties.radius);
	controls.appendChild(slider);
	slider.addEventListener('change', function(e){
		self.setInt('radius', e.srcElement.value);
	});

	return controls;
}
