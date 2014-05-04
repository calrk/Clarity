//Posterise object
CLARITY.Posteriser = function(options){
	var options = options || {};

	this.method = options.method;
	if(this.method == 'fast'){
		this.threshes = [128, 256];
		this.difference = 32;
		this.setThresh(64);
	}
	else{
		this.colours = options.colours || 5;
		this.MCut = new CLARITY.MCut().MCut;
	}

	CLARITY.Filter.call( this, options );

};

CLARITY.Posteriser.prototype = Object.create( CLARITY.Filter.prototype );

CLARITY.Posteriser.prototype.process = function(frame){
	if(this.method == 'fast'){
		return this.oldMethod(frame);
	}
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	var data = [];
	for(var i = 0; i < frame.data.length; i+=4){
		data.push([frame.data[i],frame.data[i+1],frame.data[i+2]]);
	}

	this.MCut.init(data);
	var palette = this.MCut.get_fixed_size_palette(this.colours);

	var prevDistance;
	var prevColour;
	var count = 0;
	var total = 0;
	for(var i = 0; i < frame.data.length; i+=4){
		var pix = [frame.data[i],frame.data[i+1],frame.data[i+2]];
		var tempDist;

		//attempts to improve performance by assuming that this colour might
		//be similar to the previous one, and thus don't search through
		//whole colour array.
		if(prevColour && tempDist < prevDistance + 5 && tempDist > prevDistance - 5){
			tempDist = CLARITY.Operations.colourDistance(pix, prevColour);
			col = prevColour;
		}
		else{
			var col = palette[0];
			var dist = CLARITY.Operations.colourDistance(pix, col);
			for(var j = 1; j < palette.length; j++){
				tempDist = CLARITY.Operations.colourDistance(pix, palette[j]);
				if(tempDist < dist){
					dist = tempDist;
					col = palette[j];
				}
			}
			prevColour = col;
			prevDistance = dist;
		}

		outPut.data[i]   = col[0];
		outPut.data[i+1] = col[1];
		outPut.data[i+2] = col[2];
		outPut.data[i+3] = 255;
	}

	return outPut;
};

//The old way i used to posterise, which is not accurate but is fast
CLARITY.Posteriser.prototype.oldMethod = function(frame){
	var outPut = CLARITY.ctx.createImageData(frame.width, frame.height);

	for(var i = 0; i < frame.data.length; i+=4){
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
