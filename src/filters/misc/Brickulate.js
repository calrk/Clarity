//Brickulate object
CLARITY.Brickulate = function(options){
	var options = options || {};

	this.properties = {
		horizontalSegs: options.horizontalSegs || 4,
		verticalSegs: options.verticalSegs || 4,
		grooveSize: options.grooveSize || 5,
		offset: options.offset || false
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Brickulate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Brickulate.prototype.doProcess = function(frame){
	var output = CLARITY.ctx.createImageData(frame.width, frame.height);

	var widthSegs = Math.round(frame.width/this.properties.horizontalSegs);
	var heightSegs = Math.round(frame.height/this.properties.verticalSegs);

	var grooveSize = this.properties.grooveSize;
	for(var y = 0; y < frame.height*4; y++){
		for(var x = 0; x < frame.width*4; x++){
			var i = (y*frame.width + x)*4;

			var xasd = x%widthSegs;
			var yasd = y%heightSegs;
			if(this.properties.offset){
				if(y%(heightSegs*2) < heightSegs){
					xasd += widthSegs*0.5;
					if(xasd > widthSegs){
						xasd -= widthSegs;
					}
				}
			}
			if((xasd <= grooveSize || xasd >= widthSegs-5) && (yasd <= grooveSize || yasd >= heightSegs-5)){
				output.data[i  ] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				output.data[i+1] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				output.data[i+2] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
			}
			else if(xasd <= grooveSize){
				output.data[i  ] = 255*(grooveSize-xasd)/grooveSize;
				output.data[i+1] = 255*(grooveSize-xasd)/grooveSize;
				output.data[i+2] = 255*(grooveSize-xasd)/grooveSize;
			}
			else if(xasd >= widthSegs-5){
				output.data[i  ] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				output.data[i+1] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				output.data[i+2] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
			}
			else if(yasd <= grooveSize){
				output.data[i  ] = 255*(grooveSize-yasd)/grooveSize;
				output.data[i+1] = 255*(grooveSize-yasd)/grooveSize;
				output.data[i+2] = 255*(grooveSize-yasd)/grooveSize;
			}
			else if(yasd >= heightSegs-5){
				output.data[i  ] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				output.data[i+1] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				output.data[i+2] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
			}
			else{
				output.data[i  ] = 0;
				output.data[i+1] = 0;
				output.data[i+2] = 0;
			}

			output.data[i+3] = 255;
		}
	}

	return output;
};


CLARITY.Brickulate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	

	return controls;
}
