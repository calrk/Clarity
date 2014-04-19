//TODO: Make this reduce image to a set number of colours, rather than rgb quantisation

//Posterise object
CLARITY.Posteriser = function(options){
	this.threshes = [128, 256];
	this.difference = 32;

	this.setThresh(64);
	CLARITY.Filter.call( this, options );
};

CLARITY.Posteriser.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Posteriser.prototype.process = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.data.length; i++){
		if(!((i+1)%4 == 0)){
			for(var j = 0; j < this.threshes.length; j++){
				if(frame.data[i] < this.threshes[j]){
					outPut.data[i] = this.threshes[j] - this.difference/2;
					break;
				}
			}
		}
		else{
			outPut.data[i] = 255;
		}
	}

	return outPut;
};

CLARITY.Posteriser.prototype.setThresh = function(newNo){
	this.threshes = [];
	this.difference = newNo;
	var index = 0;
	for(var i = this.difference; i <= 256; i+= this.difference){
		this.threshes[index] = i;
		index ++;
	}
	this.threshes[index] = i;
};
