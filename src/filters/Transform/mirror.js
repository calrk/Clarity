//Mirror
//Mirrors the image in x or y
CLARITY.Mirror = function(options){
	var options = options || {};

	this.properties = {
		//`options.Horizontal || true` is always true - it could never be turned off
		Horizontal: options.Horizontal === undefined ? true : options.Horizontal,
		Vertical: options.Vertical || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Mirror.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Mirror.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	//written as a gather (read from the mirrored source) rather than a scatter, so
	//every output pixel is guaranteed to be written. The old scatter used
	//width-x / height-y, which wrote index `width` on x=0 - wrapping onto the next
	//row - and never wrote column 0 at all.
	for(var y = 0; y < frame.height; y++){
		for(var x = 0; x < frame.width; x++){
			var to = (y*frame.width + x)*4;
			var fromX = x;
			var fromY = y;
			if(this.properties.Horizontal){
				fromX = frame.width-1-x;
			}
			if(this.properties.Vertical){
				fromY = frame.height-1-y;
			}

			var from = ((fromY)*frame.width + fromX)*4;

			output.data[to] = frame.data[from];
			output.data[to+1] = frame.data[from+1];
			output.data[to+2] = frame.data[from+2];

			output.data[to+3] = 255;
		}
	}

	return output;
};

CLARITY.Mirror.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('Vertical', this.properties.Vertical);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('Vertical');
	});

	toggle = CLARITY.Interface.createToggle('Horizontal', this.properties.Horizontal);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('Horizontal');
	});

	return controls;
}