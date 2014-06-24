
//NormalFlip object
CLARITY.NormalFlip = function(options){
	var options = options || {}
	this.properties = {
		red: options.red || false,
		green: options.green || false,
		swap: options.swap || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.NormalFlip.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.NormalFlip.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.width*frame.height*4; i+=4){
		if(this.properties.red){
			output.data[i] = 255-frame.data[i];
		}
		else{
			output.data[i] = frame.data[i];
		}

		if(this.properties.green){
			output.data[i+1] = 255-frame.data[i+1];
		}
		else{
			output.data[i+1] = frame.data[i+1];
		}

		if(this.properties.swap){
			var temp = output.data[i];
			output.data[i] = output.data[i+1];
			output.data[i+1] = temp;
		}

		output.data[i+2] = frame.data[i+2];
		output.data[i+3] = 255;
	}

	return output;
};

CLARITY.NormalFlip.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('Red', this.properties.red);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('red');
	});

	toggle = CLARITY.Interface.createToggle('Green', this.properties.green);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('green');
	});

	toggle = CLARITY.Interface.createToggle('Swap', this.properties.swap);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('swap');
	});

	return controls;
}
