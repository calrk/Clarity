//Invert object
CLARITY.Invert = function(options){
	var options = options || {};

	this.properties = {
		dynamic: options.dynamic || false,
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Invert.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Invert.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	if(!this.properties.dynamic){
		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			output.data[i  ] = 255-frame.data[i  ];
			output.data[i+1] = 255-frame.data[i+1];
			output.data[i+2] = 255-frame.data[i+2];
			output.data[i+3] = 255;
		}
	}
	else{
		var min = 255;
		var max = 0;

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			var colour = this.getColourValue(frame, i, this.channel);

			if(colour < min){
				min = colour;
			}
			if(colour > max){
				max = colour;
			}
		}

		for(var i = 0; i < frame.width*frame.height*4; i+=4){
			output.data[i  ] = max-min-(frame.data[i  ])+min;
			output.data[i+1] = max-min-(frame.data[i+1])+min;
			output.data[i+2] = max-min-(frame.data[i+2])+min;
			output.data[i+3] = 255;
		}
	}

	return output;
};
