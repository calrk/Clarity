
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

CLARITY.NormalFlip.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var y = 1; y < frame.height-1; y++){
		for(var x = 1; x < frame.width-1; x++){
			var i = (y*frame.width + x)*4;

			if(red){
				outPut.data[i] = 255-frame.data[i];
			}
			else{
				outPut.data[i] = frame.data[i];
			}

			if(green){
				outPut.data[i+1] = 255-frame.data[i+1];
			}
			else{
				outPut.data[i+1] = frame.data[i+1];
			}

			if(swap){
				var temp = outPut.data[i];
				outPut.data[i] = outPut.data[i+1];
				outPut.data[i+1] = temp;
			}

			outPut.data[i+2] = frame.data[i+2];
			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};

CLARITY.NormalFlip.prototype.createControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createControlGroup(titleSet);
	
	var toggle = CLARITY.Interface.createToggle(this.properties.red, 'Red');
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('red');
	});

	toggle = CLARITY.Interface.createToggle(this.properties.green, 'Green');
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('green');
	});

	toggle = CLARITY.Interface.createToggle(this.properties.swap, 'Swap');
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('swap');
	});

	return controls;
}
