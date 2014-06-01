//AddSub object
CLARITY.AddSub = function(options){
	var options = options || {};

	this.properties = {
		subtractive: options.subtractive || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.AddSub.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.AddSub.prototype.doProcess = function(frame1, frame2){
	var outPut = CLARITY.ctx.createImageData(frame1.width, frame1.height);

	for(var i = 0; i < frame1.width*frame1.height*4; i+=4){
		if(this.properties.subtractive){
			outPut.data[i  ] = frame1.data[i  ] - frame2.data[i  ];
			outPut.data[i+1] = frame1.data[i+1] - frame2.data[i+1];
			outPut.data[i+2] = frame1.data[i+2] - frame2.data[i+2];	
		}
		else{
			outPut.data[i  ] = frame1.data[i  ] + frame2.data[i  ];
			outPut.data[i+1] = frame1.data[i+1] + frame2.data[i+1];
			outPut.data[i+2] = frame1.data[i+2] + frame2.data[i+2];
		}
		outPut.data[i+3] = 255;
	}

	return outPut;
};


CLARITY.AddSub.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	var toggle = CLARITY.Interface.createToggle('subtractive', this.properties.subtractive);
	controls.appendChild(toggle);
	toggle.addEventListener('change', function(e){
		self.toggleBool('subtractive');
	});

	return controls;
}
