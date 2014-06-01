//Brickulate object
CLARITY.Brickulate = function(options){
	var options = options || {};

	this.properties = {
		horizontalSegs: options.horizontalSegs || 4,
		verticalSegs: options.verticalSegs || 4,
		grooveSize: options.grooveSize || 5
	};

	CLARITY.Filter.call( this, options );
};

CLARITY.Brickulate.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Brickulate.prototype.doProcess = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var widthSegs = Math.round(frame.width/this.properties.horizontalSegs);
	var heightSegs = Math.round(frame.height/this.properties.verticalSegs);

	var grooveSize = this.properties.grooveSize;
	for(var y = 0; y < frame.height*4; y++){
		for(var x = 0; x < frame.width*4; x++){
			var i = (y*frame.width + x)*4;

			var xasd = x%widthSegs;
			var yasd = y%heightSegs;
			if((xasd <= grooveSize || xasd >= widthSegs-5) && (yasd <= grooveSize || yasd >= heightSegs-5)){
				outPut.data[i  ] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				outPut.data[i+1] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
				outPut.data[i+2] = Math.max(255*(grooveSize-xasd)/grooveSize, 255*(xasd-widthSegs+grooveSize)/grooveSize, 255*(grooveSize-yasd)/grooveSize, 255*(yasd-heightSegs+grooveSize)/grooveSize);
			}
			else if(xasd <= grooveSize){
				outPut.data[i  ] = 255*(grooveSize-xasd)/grooveSize;
				outPut.data[i+1] = 255*(grooveSize-xasd)/grooveSize;
				outPut.data[i+2] = 255*(grooveSize-xasd)/grooveSize;
			}
			else if(xasd >= widthSegs-5){
				outPut.data[i  ] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				outPut.data[i+1] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
				outPut.data[i+2] = 255*(xasd-widthSegs+grooveSize)/grooveSize;
			}
			else if(yasd <= grooveSize){
				outPut.data[i  ] = 255*(grooveSize-yasd)/grooveSize;
				outPut.data[i+1] = 255*(grooveSize-yasd)/grooveSize;
				outPut.data[i+2] = 255*(grooveSize-yasd)/grooveSize;
			}
			else if(yasd >= heightSegs-5){
				outPut.data[i  ] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				outPut.data[i+1] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
				outPut.data[i+2] = 255*(yasd-heightSegs+grooveSize)/grooveSize;
			}
			else{
				outPut.data[i  ] = 0;
				outPut.data[i+1] = 0;
				outPut.data[i+2] = 0;
			}

			outPut.data[i+3] = 255;
		}
	}

	return outPut;
};


CLARITY.Brickulate.prototype.doCreateControls = function(titleSet){
	var self = this;
	var controls = CLARITY.Interface.createDiv();
	
	

	return controls;
}
